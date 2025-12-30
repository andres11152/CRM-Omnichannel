// src/services/whatsapp.service.ts
import { prisma } from "@/config/prisma";
import fs from "fs";
import path from "path";
import { mkdir, writeFile, rm } from "fs/promises";
import makeWASocket, {
  DisconnectReason,
  WASocket,
  fetchLatestBaileysVersion,
  jidNormalizedUser,
} from "@whiskeysockets/baileys";
import { EventEmitter } from "events";
import { downloadMediaMessage } from "@whiskeysockets/baileys";
import { Logger } from "@/utils/logger";
import { useRedisAuthState } from "./baileysRedisAuth";
import { gateway } from "@/gateways/socketGateway";
import redisClient from "@/config/redis";
import ffmpeg from "fluent-ffmpeg";
import ffmpegPath from "ffmpeg-static";
import { tmpdir } from "os";
import { readFile, unlink, writeFile as fsWriteFile } from "fs/promises";
import { getErrorMessage } from "@/utils/errorHelpers";
import { resourceManager } from "@/utils/resourceManager";

// 🎬 Configure FFMPEG with Static Binary
if (ffmpegPath) {
  ffmpeg.setFfmpegPath(ffmpegPath);
  console.log(`[WhatsApp] 🎵 FFMPEG initialized at: ${ffmpegPath}`);
} else {
  console.warn(
    "[WhatsApp] ⚠️ FFMPEG static binary not found! Voice notes may fail."
  );
}

/**
 * WhatsApp Service Singleton
 * Manages all Baileys instances, lifecycle, and external communication.
 */
export class WhatsAppService extends EventEmitter {
  private sessions: Map<string, WASocket> = new Map();
  private stores: Map<string, any> = new Map(); // Store history per session
  // Store retry counts to prevent infinite loops on specific errors (Self-Healing)
  private retryCounts: Map<string, number> = new Map();
  private MAX_RETRIES = 5;
  // ⚡ Heartbeat timers to keep sessions alive
  private heartbeatTimers: Map<string, NodeJS.Timeout> = new Map();

  constructor() {
    super();
  }

  /**
   * Initializes all sessions that are marked as ACTIVE/CONNECTED in DB.
   * Called on server startup.
   */
  public async initialize() {
    console.log("[WhatsApp] 🔧 Initializing all sessions...");
    // Try to connect to Redis if available, but don't block if it fails
    if (redisClient && !redisClient.isOpen) {
      try {
        await redisClient.connect();
      } catch (err) {
        console.warn("[WhatsApp] Redis unavailable, using file-based auth");
      }
    }
    await this.initializeAllSessions();
    console.log("[WhatsApp] ✅ Initialization complete");
  }

  private async initializeAllSessions() {
    // Only fetch sessions that shouldn't be dead
    const sessions = await prisma.whatsAppSession.findMany({
      where: { status: { not: "DISCONNECTED" } },
    });
    console.log(`[WhatsApp] Found ${sessions.length} active session(s) in DB`);
    for (const s of sessions) {
      console.log(`[WhatsApp] Initializing session: ${s.sessionId}`);
      this.initializeSession(s.sessionId).catch((e) =>
        console.error(`[WhatsApp] Failed to resume session ${s.sessionId}:`, e)
      );
    }
  }

  // Lock mechanism to prevent race conditions during init
  private initializingSessions: Set<string> = new Set();

  /**
   * Starts a specific session.
   * Handles authentication, connection logic, and event listeners.
   */
  public async initializeSession(sessionId: string) {
    if (this.initializingSessions.has(sessionId)) {
      Logger.warn(
        `[WhatsApp] Session ${sessionId} is already initializing. Skipping race condition.`
      );
      return;
    }
    this.initializingSessions.add(sessionId);

    try {
      Logger.info(`[WhatsApp] Starting session: ${sessionId}`);

      // 🛑 CRITICAL: CLEANUP OLD SESSION TO PREVENT EVENT STORMING
      const existingSock = this.sessions.get(sessionId);
      if (existingSock) {
        Logger.warn(
          `[WhatsApp] ♻️ Cleaning up existing socket for ${sessionId} before restart`
        );
        try {
          existingSock.ev.removeAllListeners("connection.update");
          existingSock.ev.removeAllListeners("creds.update");
          existingSock.ev.removeAllListeners("messages.upsert");
          existingSock.end(undefined);
        } catch (e) {
          Logger.warn(`[WhatsApp] Error closing old socket: ${e}`);
        }
        this.sessions.delete(sessionId);
      }

      // 🔄 RETRY LOGIC: Infrastructure Resilience
      // Attempt to load auth state 3 times (Redis blips)
      let authState;
      let loadRetries = 0;
      while (!authState && loadRetries < 3) {
        try {
          authState = await useRedisAuthState(sessionId);
        } catch (err: any) {
          loadRetries++;
          Logger.warn(
            `[WhatsApp] 🛑 Auth Load Failed (Attempt ${loadRetries}/3): ${err.message}`
          );
          if (loadRetries >= 3) throw err; // Propagate after max retries
          await new Promise((r) => setTimeout(r, 2000));
        }
      }

      const { state, saveCreds } = authState!;
      const { version } = await fetchLatestBaileysVersion();

      const sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false, // We use socket.io for rendering
        connectTimeoutMs: 60000, // 60 segundos para establecer conexión inicial
        keepAliveIntervalMs: 30000, // ⚡ CRÍTICO: Ping cada 30s para mantener conexión viva
        defaultQueryTimeoutMs: 60000, // 60s para queries a WhatsApp
        emitOwnEvents: false,
        retryRequestDelayMs: 250,
        markOnlineOnConnect: false, // ⚡ CRÍTICO: No marcar online automáticamente para evitar 440
        syncFullHistory: false, // No sincronizar todo el historial (reduce carga)
        shouldIgnoreJid: (jid) => jid === "status@broadcast", // Ignorar estados de WhatsApp
        // Emulate a standard browser to avoid suspicious activity flags
        browser: ["Reply CRM", "Chrome", "10.0.0"],
        // ⚡ CONFIGURACIÓN ADICIONAL PARA ESTABILIDAD
        getMessage: async (key) => {
          // Provide message retrieval for better connection stability
          const store = this.stores.get(sessionId);
          if (store?.messages[key.remoteJid!]) {
            return store.messages[key.remoteJid!].array.find(
              (msg: any) => msg.key.id === key.id
            );
          }
          return undefined;
        },
      });

      // 🧠 Redis-Backed Store (Scalable, Robust, & Cloud-Ready)
      // Stores ephemeral message history in Redis. No local files.
      // TTL: 24h to auto-clean old sessions.
      const storeKey = `wa:store:v2:${sessionId}`;

      const store = {
        saveTimer: null as any,
        chats: {
          data: {} as Record<string, any>,
          all: function () {
            return Object.values(this.data);
          },
        },
        contacts: {} as Record<string, any>, // 📇 CONTACTS STORE
        resolveLid: async function (lid: string) {
          if (!lid) return null;

          // Normalize for comparison (strip suffixes)
          const target = lid.replace(/@.*$/, "");

          // REVERSE LOOKUP: Find the contact object where the 'lid' property matches our target
          // This is critical because the store is indexed by Phone Number, so we must search values.
          const contact = Object.values(this.contacts || {}).find(
            (c: any) => c.lid === lid || c.lid === target || c.id === lid
          );

          if (contact) {
            const resolved = (contact as any).id;
            const cleanResolved = resolved
              .replace(/@.*$/, "")
              .replace(/\D/g, "");

            // ✅ VALIDATION: Don't return self-mappings or LID-to-LID
            // Rule 1: Resolved must be different from input
            if (cleanResolved === target) {
              console.warn(
                `[ResolveLid] ⚠️ Ignored self-mapping in memory: ${target}`
              );
              return null;
            }

            // Rule 2: Resolved must be a REAL phone (< 15 chars)
            if (cleanResolved.length > 14) {
              console.warn(
                `[ResolveLid] ⚠️ Resolved to another LID: ${cleanResolved}`
              );
              return null;
            }

            return resolved;
          }

          // 3. DB Fallback (Persistent - Multi-Source Lookup)
          try {
            // We need companyId context.
            // Since we are inside initializeSession, we have access to 'sessionId'.
            const session = await prisma.whatsAppSession.findUnique({
              where: { sessionId },
              select: { companyId: true },
            });

            if (session) {
              // 🔍 STRATEGY 1: Look in Contact customFields (Primary)
              const dbContact = await prisma.contact.findFirst({
                where: {
                  companyId: session.companyId,
                  OR: [
                    // Future-proof: Check metadata/customFields if we start storing LID there
                    { customFields: { path: ["lid"], equals: lid } },
                    { customFields: { path: ["lid"], equals: target } },
                  ],
                },
              });

              if (dbContact && dbContact.phone) {
                const cleanPhone = dbContact.phone.replace(/\D/g, "");

                // ✅ VALIDATION: Same rules for DB results
                if (cleanPhone === target || cleanPhone.length > 14) {
                  console.warn(
                    `[ResolveLid] ⚠️ DB returned invalid mapping from Contact: ${cleanPhone}`
                  );
                  return null;
                }

                console.log(
                  `[ResolveLid] ✅ Resolved from Contact DB: ${target} -> ${cleanPhone}`
                );
                return dbContact.phone;
              }

              // 🔍 STRATEGY 2: Look in Conversations (Fallback)
              // Sometimes we have conversations with LIDs where channelId could be the real phone
              const conversation = await prisma.conversation.findFirst({
                where: {
                  companyId: session.companyId,
                  OR: [
                    // The conversation might have been created with the LID initially
                    { channelId: { contains: target.substring(0, 10) } }, // Partial match
                  ],
                },
                include: {
                  participants: {
                    take: 1,
                    where: {
                      email: { contains: "@whatsapp.user" },
                    },
                  },
                },
              });

              if (conversation && conversation.participants[0]?.phone) {
                const cleanPhone = conversation.participants[0].phone.replace(
                  /\D/g,
                  ""
                );

                // ✅ VALIDATION
                if (cleanPhone === target || cleanPhone.length > 14) {
                  console.warn(
                    `[ResolveLid] ⚠️ DB returned invalid mapping from Conversation: ${cleanPhone}`
                  );
                  return null;
                }

                console.log(
                  `[ResolveLid] ✅ Resolved from Conversation DB: ${target} -> ${cleanPhone}`
                );
                return conversation.participants[0].phone;
              }
            }
          } catch (e) {
            console.warn("[ResolveLid] DB Lookup failed", e);
          }

          return null;
        },
        messages: {} as Record<string, { array: any[] }>,

        // Load from Redis (Async Rehydration)
        load: async () => {
          try {
            const raw = await redisClient.get(storeKey);
            if (raw) {
              const data = JSON.parse(raw);
              store.chats.data = data.chats || {};
              store.contacts = data.contacts || {};
              store.messages = data.messages || {};
              Logger.info(
                `[Store] 🧠 Rehydrated from Redis: ${
                  Object.keys(store.messages).length
                } active chats.`
              );
            }
          } catch (e) {
            Logger.warn(`[Store] Redis rehydration skipped (fresh session).`);
          }
        },

        // Save to Redis (Debounced 2s + 24h TTL)
        save: () => {
          if (store.saveTimer) clearTimeout(store.saveTimer);
          store.saveTimer = setTimeout(() => {
            const payload = JSON.stringify({
              chats: store.chats.data,
              messages: store.messages,
              contacts: store.contacts,
            });
            // 86400s = 24 Hours Retention
            redisClient
              .set(storeKey, payload, { EX: 86400 })
              .catch((err) => Logger.error(`[Store] Redis Save Failed`, err));

            store.saveTimer = null;
          }, 2000);
        },

        bind: (ev: any) => {
          // 1. Capture Upserts
          ev.on("messages.upsert", (upsert: any) => {
            if (!upsert?.messages || !Array.isArray(upsert.messages)) return;
            if (upsert.messages.length > 0)
              Logger.info(`[Store] 📥 Upsert: ${upsert.messages.length} msgs`);

            let changed = false;
            for (const msg of upsert.messages) {
              const jid = msg.key.remoteJid;
              if (!jid) continue;

              if (!store.messages[jid]) store.messages[jid] = { array: [] };
              if (!store.chats.data[jid]) store.chats.data[jid] = { id: jid };

              const arr = store.messages[jid].array;
              // Dedupe
              if (!arr.some((m: any) => m.key.id === msg.key.id)) {
                arr.push(msg);
                changed = true;
                // Limit to last 500 in RAM/Redis to be safe
                if (arr.length > 500)
                  store.messages[jid].array = arr.slice(-500);
              }
            }
            if (changed) store.save();
          });

          // 2. Capture Contacts Upsert (Sync) + AUTO-LEARN LID MAPPINGS
          ev.on("contacts.upsert", async (contacts: any[]) => {
            if (!contacts || !Array.isArray(contacts)) return;
            contacts.forEach((c) => {
              store.contacts[c.id] = { ...(store.contacts[c.id] || {}), ...c };

              // 🧠 AUTO-LEARNING: If Baileys gives us both LID and Phone, persist it to DB
              if (c.lid && c.id && c.id !== c.lid) {
                // Fire-and-forget DB update (don't await to avoid blocking)
                (async () => {
                  try {
                    const phoneJid = c.id.split("@")[0].split(":")[0];
                    const lidJid = c.lid.replace(/@.*$/, "");

                    // Get company context from session
                    const session = await prisma.whatsAppSession.findUnique({
                      where: { sessionId },
                      select: { companyId: true },
                    });

                    if (!session) return;

                    // Find contact by phone in the DB
                    const dbContact = await prisma.contact.findFirst({
                      where: {
                        phone: phoneJid,
                        companyId: session.companyId,
                      },
                    });

                    if (dbContact) {
                      const currentFields =
                        (dbContact.customFields as any) || {};
                      if (currentFields.lid !== c.lid) {
                        console.log(
                          `[Auto-Learn] 💾 Discovered LID mapping: ${phoneJid} <-> ${lidJid}`
                        );
                        await prisma.contact.update({
                          where: { id: dbContact.id },
                          data: {
                            customFields: {
                              ...currentFields,
                              lid: c.lid,
                            },
                          },
                        });
                      }
                    }
                  } catch (e) {
                    console.warn(
                      "[Auto-Learn] Failed to persist LID mapping",
                      e
                    );
                  }
                })();
              }
            });
            store.save();
          });

          // 3. Capture History
          ev.on("messaging-history.set", (data: any) => {
            Logger.info(`[Store] 📚 History Set Received`);
            let changed = false;
            // 📇 Capture Contacts
            if (data.contacts) {
              data.contacts.forEach((c: any) => {
                store.contacts[c.id] = {
                  ...(store.contacts[c.id] || {}),
                  ...c,
                };
              });
              changed = true;
            }
            if (data.chats) {
              data.chats.forEach((c: any) => (store.chats.data[c.id] = c));
              changed = true;
            }
            if (data.messages) {
              for (const item of data.messages) {
                const msg = item;
                const jid = msg.key?.remoteJid;
                if (jid) {
                  if (!store.messages[jid]) store.messages[jid] = { array: [] };
                  store.messages[jid].array.push(msg);
                  changed = true;
                }
              }
            }
            if (changed) store.save();
          });
        },
      };

      // 🏁 FIX: Bind Events IMMEDIATELY before awaiting async I/O
      // This prevents missing the 'messaging-history.set' event which fires very fast
      store.bind(sock.ev);
      this.stores.set(sessionId, store);

      this.sessions.set(sessionId, sock);

      // Load initial data (Async - non-blocking for events, but good to have)
      store.load().catch((e) => console.error("Failed to load store", e));

      // --- EVENTS ---

      // 1. Credentials Update (Persist to Redis)
      sock.ev.on("creds.update", saveCreds);

      // 2. Connection Update (The Core Logic)
      sock.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect, qr } = update;
        const io = gateway.getIO();

        // Handle QR Code Generation
        if (qr) {
          Logger.info(`[WhatsApp] QR Generated for ${sessionId}`);

          try {
            const existingSession = await prisma.whatsAppSession.findUnique({
              where: { sessionId },
            });

            if (existingSession) {
              await prisma.whatsAppSession.update({
                where: { sessionId },
                data: { qrCode: qr, status: "SCANNING" },
              });
            } else {
              Logger.warn(
                `[WhatsApp] Session ${sessionId} deleted. Skipping QR update.`
              );
            }
          } catch (err) {
            Logger.warn(
              `[WhatsApp] Failed to update QR for ${sessionId}:`,
              err
            );
          }

          io?.emit("qr.updated", { sessionId, qr });
          io?.emit("session.status", { sessionId, status: "SCANNING" });
        }

        // Handle Connection Success
        if (connection === "open") {
          Logger.info(`[WhatsApp] ✅ Session ${sessionId} CONNECTED`);
          this.retryCounts.delete(sessionId); // Reset retries on success

          const user = sock.user;
          const phone = user?.id?.split(":")[0];

          try {
            const session = await prisma.whatsAppSession.findUnique({
              where: { sessionId },
            });

            if (session) {
              await prisma.whatsAppSession.update({
                where: { sessionId },
                data: {
                  status: "CONNECTED",
                  phone: phone || undefined,
                  qrCode: null,
                },
              });
            } else {
              Logger.warn(
                `[WhatsApp] Session ${sessionId} no longer exists in DB. Skipping update.`
              );
            }
          } catch (err) {
            Logger.error(
              `[WhatsApp] Failed to update session ${sessionId} on connect:`,
              err
            );
          }

          io?.emit("session.status", {
            sessionId,
            status: "CONNECTED",
            phone,
          });

          // ⚡ INICIAR HEARTBEAT para mantener conexión viva
          this.startHeartbeat(sessionId, sock);
        }

        // Handle Connection Close/Failure
        // Handle Connection Close/Failure
        if (connection === "close") {
          const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
          const errorMsg = (lastDisconnect?.error as any)?.message || "";

          // CRITICAL FIX: Detect QR Timeout (408) or explicit timeout error
          const isTimeout =
            statusCode === 408 || errorMsg.includes("QR refs attempts ended");

          // 💀 FATAL SYNC ERROR: "failed to find key" (Session is corrupted)
          if (errorMsg.includes("failed to find key")) {
            Logger.error(
              `[WhatsApp] 💥 CRITICAL: Session ${sessionId} sync data corrupted ("failed to find key"). Wiping session to force fresh start.`
            );
            await this.handleSessionFailure(sessionId);
            await this.clearSessionData(sessionId);
            // Don't auto-reconnect logic below, just exit.
            // A fresh QR will be generated on next manual init or if logic allows.
            return;
          }

          if (isTimeout) {
            Logger.warn(
              `[WhatsApp] 🛑 QR Code expired or process timed out for ${sessionId}. Stopping loop.`
            );
            await this.handleSessionFailure(sessionId);
            // DO NOT RECONNECT AUTOMATICALLY
            return;
          }

          // Special Handling for Conflict (440) - PRESERVAR SESIÓN
          const isConflict = statusCode === 440;
          if (isConflict) {
            Logger.warn(
              `[WhatsApp] ⚔️ Conflict detected (440) for ${sessionId}. Another device is connected. Waiting before retry...`
            );
            // ⚡ NO BORRAR CREDENCIALES - Solo detener listeners temporalmente
            // El conflicto usualmente se resuelve solo cuando el otro dispositivo se desconecta
            sock.ev.removeAllListeners("creds.update");
            sock.ev.removeAllListeners("connection.update");
            sock.ev.removeAllListeners("messages.upsert");

            // Esperar 30s y reintentar (NO incrementar retries para conflictos)
            Logger.info(`[WhatsApp] ⏳ Will retry connection in 30 seconds...`);
            setTimeout(() => this.initializeSession(sessionId), 30000);
            return; // Salir temprano sin marcar como failed
          }

          // Normal Reconnection Logic
          const shouldReconnect =
            statusCode !== DisconnectReason.loggedOut &&
            statusCode !== 401 &&
            statusCode !== 403;

          Logger.warn(
            `[WhatsApp] ❌ Connection closed for ${sessionId}. Code: ${statusCode}. Reconnect: ${shouldReconnect}`
          );

          // ⚡ DETENER HEARTBEAT
          this.stopHeartbeat(sessionId);

          // Remove listeners immediately
          sock.ev.removeAllListeners("connection.update");
          sock.ev.removeAllListeners("messages.upsert");

          if (shouldReconnect) {
            const retries = this.retryCounts.get(sessionId) || 0;
            if (retries < this.MAX_RETRIES) {
              this.retryCounts.set(sessionId, retries + 1);
              // If conflict, force at least 5s delay. Else standard backoff.
              const baseDelay = Math.min(retries * 2000, 10000) || 1000;
              const delay = isConflict ? 5000 : baseDelay;

              setTimeout(() => this.initializeSession(sessionId), delay);
            } else {
              Logger.error(
                `[WhatsApp] Max retries reached for ${sessionId}. Marking as DISCONNECTED.`
              );
              await this.handleSessionFailure(sessionId);
            }
          } else {
            // Fatal Error
            Logger.warn(
              `[WhatsApp] Session ${sessionId} logged out or invalid. Cleaning up.`
            );
            await this.handleSessionFailure(sessionId);
            await this.clearSessionData(sessionId);
          }
        }
      });

      // 3. Message Handling
      sock.ev.on("messages.upsert", async (m) => {
        if (m.type === "notify" || m.type === "append") {
          for (const msg of m.messages) {
            // 🤫 Ignore Protocol Messages (Label updates, etc) to keep logs clean
            if (msg.message?.protocolMessage) continue;

            if (!msg.message) {
              continue;
            }

            // Log only relevant messages
            if (m.messages.length === 1) {
              Logger.info(
                `[WhatsApp Debug] 📨 Processing: ${msg.key.remoteJid}`
              );
            }

            await this.handleIncomingMessage(msg, sessionId);
          }
        }
      });
    } catch (error: unknown) {
      const errorMsg = getErrorMessage(error);
      Logger.error(
        `[WhatsApp] Fatal error initializing session ${sessionId}`,
        errorMsg
      );

      // 🛡️ PREVENT RETRY STORMS
      const retryCount = this.retryCounts.get(sessionId) || 0;

      if (retryCount >= this.MAX_RETRIES) {
        Logger.error(
          `[WhatsApp] 🚨 Max retries (${this.MAX_RETRIES}) reached for ${sessionId}. Giving up.`
        );
        this.retryCounts.delete(sessionId);
        this.handleSessionFailure(sessionId);
        return;
      }

      // 🧠 INTELLIGENT FAILURE HANDLING
      const isInfraError =
        errorMsg.includes("Redis") ||
        errorMsg.includes("Socket closed") ||
        errorMsg.includes("ECONNRESET") ||
        errorMsg.includes("timeout");

      if (isInfraError) {
        this.retryCounts.set(sessionId, retryCount + 1);
        const delay = Math.min(10000 * Math.pow(2, retryCount), 60000); // Max 60s

        Logger.warn(
          `[WhatsApp] ⏳ Infrastructure error for ${sessionId}. Retry ${
            retryCount + 1
          }/${this.MAX_RETRIES} in ${delay}ms`
        );

        // 🛡️ Use resourceManager for cleanup
        resourceManager.setTimeout(() => {
          this.initializeSession(sessionId);
        }, delay);
      } else {
        // Logic/auth failures - don't retry
        Logger.error(
          `[WhatsApp] Non-retryable error for ${sessionId}: ${errorMsg}`
        );
        this.retryCounts.delete(sessionId);
        this.handleSessionFailure(sessionId);
      }
    } finally {
      this.initializingSessions.delete(sessionId);
    }
  }

  // --- Helpers ---

  /**
   * 🧠 AGGRESSIVE LID PERSISTENCE
   * Fire-and-forget method to save LID mapping to DB
   */
  private async persistLidMapping(
    sessionId: string,
    phone: string,
    lid: string
  ): Promise<void> {
    try {
      // Normalize inputs
      const cleanPhone = phone.replace(/[^\d]/g, "");
      const cleanLid = lid.replace(/@.*$/, "");

      // ✅ VALIDATION: Block Self-Mapping and Invalid Phones
      // Rule 1: Phone must NOT equal LID
      if (cleanPhone === cleanLid) {
        console.warn(
          `[PersistLID] ⚠️ Ignored self-mapping: ${cleanPhone} === ${cleanLid}`
        );
        return;
      }

      // Rule 2: Phone must be a REAL phone number (< 15 chars)
      // LIDs are typically 15-20 digits, real phones are 7-14
      if (cleanPhone.length > 14) {
        console.warn(
          `[PersistLID] ⚠️ Ignored invalid mapping: ${cleanPhone} is not a valid real phone (too long)`
        );
        return;
      }

      // Rule 3: Phone must NOT be another LID
      if (lid.includes("@lid") && phone.includes("@lid")) {
        console.warn(
          `[PersistLID] ⚠️ Ignored LID-to-LID mapping: ${cleanPhone} -> ${cleanLid}`
        );
        return;
      }

      // Get company context
      const session = await prisma.whatsAppSession.findUnique({
        where: { sessionId },
        select: { companyId: true },
      });

      if (!session) return;

      // Find contact
      const contact = await prisma.contact.findFirst({
        where: {
          companyId: session.companyId,
          phone: cleanPhone,
        },
      });

      if (contact) {
        const currentFields = (contact.customFields as any) || {};

        // 🛡️ AUTO-CORRECTION: Overwrite bad mappings (LID=LID)
        const needsUpdate =
          currentFields.lid !== cleanLid || // New mapping
          currentFields.lid === cleanPhone; // Bad self-mapping detected

        if (needsUpdate) {
          console.log(
            `[PersistLID] 💾 Saving mapping: ${cleanPhone} <-> ${cleanLid}${
              currentFields.lid === cleanPhone
                ? " (Auto-Correcting bad data)"
                : ""
            }`
          );
          await prisma.contact.update({
            where: { id: contact.id },
            data: {
              customFields: {
                ...currentFields,
                lid: cleanLid,
              },
            },
          });
        }
      }
    } catch (e) {
      // Non-blocking: just log the error
      console.warn("[PersistLID] Failed to save mapping", e);
    }
  }

  private async handleSessionFailure(sessionId: string) {
    // ⚡ Detener heartbeat primero
    this.stopHeartbeat(sessionId);

    try {
      await prisma.whatsAppSession.update({
        where: { sessionId },
        data: { status: "DISCONNECTED", qrCode: null },
      });
    } catch (e) {
      // Ignore if record already deleted
    }
    this.sessions.delete(sessionId);
    gateway
      .getIO()
      ?.emit("session.status", { sessionId, status: "DISCONNECTED" });
  }

  private async clearSessionData(sessionId: string) {
    const REDIS_KEY = `wa:auth:${sessionId}`;
    if (redisClient?.isOpen) {
      try {
        await redisClient.del(REDIS_KEY);
      } catch (err) {
        Logger.warn("[WhatsApp] Failed to clear Redis data (non-critical)");
      }
    }
    // await prisma.whatsAppSession.delete... // Optional
  }

  /**
   * ⚡ HEARTBEAT: Mantiene la sesión activa mediante consultas periódicas
   * Previene que WhatsApp desconecte la sesión por inactividad
   */
  private startHeartbeat(sessionId: string, sock: WASocket) {
    // Limpiar cualquier heartbeat existente primero
    this.stopHeartbeat(sessionId);

    Logger.info(`[WhatsApp] 💓 Starting heartbeat for ${sessionId}`);

    // Realizar ping cada 5 minutos (300,000 ms)
    const heartbeat = setInterval(async () => {
      try {
        // Verificar si la sesión aún existe
        if (!this.sessions.has(sessionId)) {
          Logger.warn(
            `[WhatsApp] Session ${sessionId} no longer exists. Stopping heartbeat.`
          );
          this.stopHeartbeat(sessionId);
          return;
        }

        // Consultar el estado de presencia para mantener la conexión activa
        // Esto es una operación ligera que mantiene el websocket vivo
        const jid = sock.user?.id;
        if (jid) {
          await sock.presenceSubscribe(jid).catch(() => {
            // Ignorar errores silenciosamente, el heartbeat es "best effort"
          });
        }

        Logger.debug(`[WhatsApp] 💓 Heartbeat ping sent for ${sessionId}`);
      } catch (error) {
        // No hacer nada, el heartbeat es "best effort"
        Logger.debug(
          `[WhatsApp] Heartbeat ping failed for ${sessionId}, will retry`
        );
      }
    }, 300000); // 5 minutos

    this.heartbeatTimers.set(sessionId, heartbeat);
  }

  /**
   * ⚡ Detiene el heartbeat de una sesión
   */
  private stopHeartbeat(sessionId: string) {
    const timer = this.heartbeatTimers.get(sessionId);
    if (timer) {
      clearInterval(timer);
      this.heartbeatTimers.delete(sessionId);
      Logger.info(`[WhatsApp] 💔 Heartbeat stopped for ${sessionId}`);
    }
  }

  /**
   * Process Incoming Message
   */
  private async handleIncomingMessage(msg: any, sessionId: string) {
    try {
      // 🛑 IGNORAR ESTADOS DE WHATSAPP (Broadcasts)
      if (msg.key.remoteJid === "status@broadcast") {
        return;
      }

      // ---------------------------------------------------------
      // 🎯 FINAL ROUTING FIX: ALWAYS TRUST REMOTE JID
      // ---------------------------------------------------------

      // 1. Determine the raw ID
      const isOutbound = msg.key?.fromMe === true;
      let targetJid = msg.key.remoteJid;

      // 2. FOR OUTGOING MESSAGES (Phone Sync):
      if (msg.key.fromMe) {
        // CRITICAL: The remoteJid IS the recipient (The Client).
        // We must NEVER use 'participant' or 'author' here for 1:1 chats,
        // because that points to the Agent's own LID.
        targetJid = msg.key.remoteJid;
      }

      // 3. SANITIZATION (Strip suffixes)
      // Ensure we get the pure number: '57300...@s.whatsapp.net' -> '57300...'
      if (targetJid) {
        targetJid = targetJid.split("@")[0].split(":")[0]; // Safe split mostly
      }

      // 3.5 🧠 SMART EXTRACTION: Look for Real Phone in Message Metadata
      // This is critical for LID messages where the real phone is hidden in metadata
      let foundRealPhone: string | null = null;
      const currentRemoteJid = msg.key.remoteJid;

      // 🔍 DEBUG: Log the entire message structure for LID messages
      const isLidMessage =
        currentRemoteJid &&
        (currentRemoteJid.includes("@lid") || targetJid.length > 14);

      if (isLidMessage) {
        console.log(
          `[SmartExtract] 🔍 DEBUG - Analyzing LID message: ${currentRemoteJid}`
        );
        console.log(
          `[SmartExtract] 🔍 msg.key:`,
          JSON.stringify(msg.key, null, 2)
        );
        console.log(`[SmartExtract] 🔍 msg.participant:`, msg.participant);
        console.log(
          `[SmartExtract] 🔍 msg.messageStubParameters:`,
          msg.messageStubParameters
        );
        console.log(`[SmartExtract] 🔍 msg.pushName:`, msg.pushName);
        console.log(
          `[SmartExtract] 🔍 msg.verifiedBizName:`,
          msg.verifiedBizName
        );
      }

      // Only extract if current JID is a LID
      if (isLidMessage) {
        // 🎯 Check 0: msg.key.remoteJidAlt (CRITICAL - Baileys LID Messages)
        // This is where Baileys stores the real phone for messages with addressingMode: 'lid'
        if (
          msg.key.remoteJidAlt &&
          msg.key.remoteJidAlt.includes("@s.whatsapp.net") &&
          !msg.key.remoteJidAlt.includes("@lid")
        ) {
          foundRealPhone = msg.key.remoteJidAlt;
          console.log(
            `[SmartExtract] ✅ Found Real Phone in key.remoteJidAlt: ${foundRealPhone}`
          );
        }

        // Check 1: msg.key.participant (Most common place for real phone)
        if (
          !foundRealPhone &&
          msg.key.participant &&
          msg.key.participant.includes("@s.whatsapp.net")
        ) {
          foundRealPhone = msg.key.participant;
          console.log(
            `[SmartExtract] ✅ Found Real Phone in key.participant: ${foundRealPhone}`
          );
        }

        // Check 2: msg.participant (Alternative location)
        if (
          !foundRealPhone &&
          msg.participant &&
          msg.participant.includes("@s.whatsapp.net")
        ) {
          foundRealPhone = msg.participant;
          console.log(
            `[SmartExtract] ✅ Found Real Phone in participant: ${foundRealPhone}`
          );
        }

        // Check 3: msg.messageStubParameters (Array that sometimes has the real JID)
        if (
          !foundRealPhone &&
          msg.messageStubParameters &&
          Array.isArray(msg.messageStubParameters)
        ) {
          for (const param of msg.messageStubParameters) {
            if (
              param &&
              typeof param === "string" &&
              param.includes("@s.whatsapp.net")
            ) {
              foundRealPhone = param;
              console.log(
                `[SmartExtract] ✅ Found Real Phone in messageStubParameters: ${foundRealPhone}`
              );
              break;
            }
          }
        }

        // Check 4: Check contacts store for this LID
        if (!foundRealPhone) {
          const store = this.stores.get(sessionId);
          if (store && store.contacts) {
            const cleanLid = currentRemoteJid.replace(/@.*$/, "");
            const contact = Object.values(store.contacts).find(
              (c: any) => c.lid === currentRemoteJid || c.lid === cleanLid
            );

            if (contact && (contact as any).id) {
              const contactId = (contact as any).id;
              if (
                contactId.includes("@s.whatsapp.net") &&
                !contactId.includes("@lid")
              ) {
                foundRealPhone = contactId;
                console.log(
                  `[SmartExtract] ✅ Found Real Phone in contacts store: ${foundRealPhone}`
                );
              }
            }
          }
        }

        // If we found a real phone, force the swap and persist
        if (foundRealPhone) {
          const cleanRealPhone = foundRealPhone.split("@")[0].split(":")[0];
          console.log(
            `[SmartExtract] 🔀 FORCING Swap: ${currentRemoteJid} -> ${cleanRealPhone}`
          );

          // Update targetJid to the real phone
          targetJid = cleanRealPhone;

          // 🧠 SYNC NAME: If we have a pushName, update the contact name
          if (msg.pushName && msg.pushName.trim()) {
            (async () => {
              try {
                const session = await prisma.whatsAppSession.findUnique({
                  where: { sessionId },
                  select: { companyId: true },
                });

                if (session) {
                  const contact = await prisma.contact.findFirst({
                    where: {
                      companyId: session.companyId,
                      phone: cleanRealPhone,
                    },
                  });

                  if (contact) {
                    // Only update if current name is generic (the phone number itself)
                    if (
                      contact.name === cleanRealPhone ||
                      contact.name === `${cleanRealPhone}`
                    ) {
                      await prisma.contact.update({
                        where: { id: contact.id },
                        data: { name: msg.pushName },
                      });
                      console.log(
                        `[SmartExtract] 👤 Updated contact name: ${cleanRealPhone} -> ${msg.pushName}`
                      );
                    }
                  }
                }
              } catch (e) {
                console.warn("[SmartExtract] Failed to update name", e);
              }
            })();
          }

          // Persist this discovery immediately (fire-and-forget)
          this.persistLidMapping(
            sessionId,
            cleanRealPhone,
            currentRemoteJid
          ).catch(() => {});
        }
      }

      // 4. LID RESOLUTION & NORMALIZATION (Split-Brain Prevention)
      // ⚠️ SKIP if Smart Extraction already found the real phone
      // Check for LID using robust logic (Suffix OR Length)
      const isLid =
        msg.key.remoteJid.includes("@lid") ||
        (targetJid && targetJid.length > 14);

      if (targetJid && isLid && !foundRealPhone) {
        const store = this.stores.get(sessionId);
        if (store) {
          let resolved = await store.resolveLid(msg.key.remoteJid);

          if (resolved) {
            const cleanResolved = resolved.split("@")[0].split(":")[0];
            console.log(
              `[Normalization] 🔀 Redirecting Traffic: ${targetJid} -> ${cleanResolved}`
            );
            targetJid = cleanResolved;
            // Note: We don't overwrite msg.key.remoteJid here to preserve it for 'originalLid' in merge logic

            // 🧠 AGGRESSIVE PERSISTENCE: Save this mapping immediately
            this.persistLidMapping(
              sessionId,
              cleanResolved,
              msg.key.remoteJid
            ).catch(() => {});
          } else {
            console.warn(
              `[Resolution] ⚠️ Could not resolve LID: ${targetJid}. Passing LID to processor (Fallback).`
            );
            // Permissive Fallback: Keep targetJid as LID
          }
        }
      }

      // 5. LOG FOR DEBUGGING
      console.log(
        `[Fix] Routing Message to: ${targetJid} (Was fromMe: ${msg.key.fromMe})`
      );

      if (!targetJid) {
        console.warn(
          "[WhatsApp Debug] ⚠️ Skipping processing because JID is invalid:",
          msg.key
        );
        return;
      }

      const remoteJid = targetJid;

      console.log(
        `[handleIncomingMessage] 📍 Step 1: Starting profile fetch for ${remoteJid}`
      );

      // 🖼️ FETCH PROFILE INFO (Only for Inbound/Customer)
      let profilePicUrl: string | undefined;
      let about: string | undefined;

      // 🛡️ TIMEOUT HELPER: Prevents Baileys operations from blocking indefinitely
      const withTimeout = <T>(
        promise: Promise<T>,
        timeoutMs: number
      ): Promise<T | undefined> => {
        return Promise.race([
          promise,
          new Promise<undefined>((resolve) =>
            setTimeout(() => resolve(undefined), timeoutMs)
          ),
        ]);
      };

      if (!isOutbound) {
        try {
          console.log(
            `[handleIncomingMessage] 📍 Step 2: Fetching profile for inbound message`
          );
          const sock = this.sessions.get(sessionId);
          if (sock) {
            // ⏱️ CRITICAL FIX: Add 2s timeout to prevent hanging
            const externalUrl = await withTimeout(
              sock.profilePictureUrl(remoteJid, "image").catch(() => undefined),
              2000 // 2 second timeout
            );

            // 📥 DOWNLOAD & PERSIST PROFILE PIC
            if (externalUrl) {
              try {
                const res = await fetch(externalUrl);
                if (res.ok) {
                  const buffer = Buffer.from(await res.arrayBuffer());
                  const profilesDir = path.join(
                    process.cwd(),
                    "public",
                    "uploads",
                    "profiles"
                  );
                  await mkdir(profilesDir, { recursive: true });

                  // Clean JID & Timestamp
                  const cleanJid = remoteJid.replace(/\D/g, "");
                  const filename = `${cleanJid}_${Date.now()}.jpg`;
                  await writeFile(path.join(profilesDir, filename), buffer);

                  // Set Local URL
                  profilePicUrl = `/uploads/profiles/${filename}`;
                } else {
                  profilePicUrl = externalUrl;
                }
              } catch (e) {
                console.error("[WhatsApp] Failed to download profile pic", e);
                profilePicUrl = externalUrl; // Fallback
              }
            } else {
              profilePicUrl = undefined;
            }

            // ⏱️ CRITICAL FIX: Add 2s timeout to fetchStatus
            const statusData = await withTimeout(
              sock.fetchStatus(remoteJid).catch(() => undefined),
              2000 // 2 second timeout
            );
            about = statusData?.status;
          }
          console.log(
            `[handleIncomingMessage] 📍 Step 3: Profile fetch completed`
          );
        } catch (e) {
          console.error("[handleIncomingMessage] ⚠️ Profile fetch error:", e);
          // Ignore profile fetch errors - don't block message processing
        }
      }

      console.log(
        `[handleIncomingMessage] 📍 Step 4: Extracting message content`
      );

      // Extract basic content
      let text =
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        "";
      let mediaType = "";
      let mimeType = "";

      if (msg.message?.imageMessage) {
        mediaType = "image";
        mimeType = msg.message.imageMessage.mimetype;
        text = msg.message.imageMessage.caption || text;
      } else if (msg.message?.videoMessage) {
        mediaType = "video";
        mimeType = msg.message.videoMessage.mimetype;
        text = msg.message.videoMessage.caption || text;
      } else if (msg.message?.documentMessage) {
        mediaType = "document";
        mimeType = msg.message.documentMessage.mimetype;
        text = msg.message.documentMessage.caption || text;
      } else if (msg.message?.audioMessage) {
        mediaType = "audio";
        mimeType = msg.message.audioMessage.mimetype;
      } else if (msg.message?.stickerMessage) {
        mediaType = "sticker";
        mimeType = msg.message.stickerMessage.mimetype || "image/webp";
      } else if (msg.message?.locationMessage) {
        mediaType = "location";
        mimeType = "application/json"; // Logical type
        text = "📍 Ubicación compartida";
      } else if (msg.message?.contactMessage) {
        mediaType = "contact";
        mimeType = "text/vcard";
        text = `👤 Contacto: ${msg.message.contactMessage.displayName}`;
      } else if (msg.message?.contactsArrayMessage) {
        mediaType = "contact_list";
        mimeType = "text/vcard";
        text = `👤 ${
          msg.message.contactsArrayMessage.contacts?.length || 0
        } Contactos compartidos`;
      }

      // 🔍 DEBUG: Log message content before filtering
      if (!text && !mediaType) {
        console.warn(
          `[handleIncomingMessage] ⚠️ Skipping message - No text or media`
        );
        console.warn(`[handleIncomingMessage] 🔍 remoteJid: ${remoteJid}`);
        console.warn(`[handleIncomingMessage] 🔍 msg.message:`, msg.message);
        console.warn(`[handleIncomingMessage] 🔍 msg.key.id:`, msg.key.id);
        return; // Ignore protocol messages
      }

      // Resolve Session Record
      const sessionRecord = await prisma.whatsAppSession.findUnique({
        where: { sessionId },
      });
      if (!sessionRecord) return;

      let mediaInfo = undefined;
      // Handle Media Download
      // Handle Media Processing
      if (mediaType) {
        // A. FILE-BASED MEDIA (Download required)
        if (
          ["image", "video", "audio", "document", "sticker"].includes(mediaType)
        ) {
          try {
            const buffer = (await downloadMediaMessage(
              msg,
              "buffer",
              {},
              {
                logger: console as any,
                reuploadRequest: sessionRecord.id as any,
              }
            )) as Buffer;

            if (buffer) {
              const uploadDir = path.join(
                process.cwd(),
                "public",
                "uploads",
                sessionRecord.companyId
              );
              await mkdir(uploadDir, { recursive: true });

              const ext = mimeType?.split("/")[1]?.split(";")[0] || "bin";
              const filename = `${Date.now()}_${Math.random()
                .toString(36)
                .substring(7)}.${ext}`;
              const filePath = path.join(uploadDir, filename);

              await writeFile(filePath, buffer);
              const publicUrl = `/uploads/${sessionRecord.companyId}/${filename}`;

              mediaInfo = {
                url: publicUrl,
                type: mediaType,
                mimetype: mimeType,
                caption: text,
              };

              if (!text) text = `[${mediaType.toUpperCase()}]`;
            }
          } catch (e) {
            Logger.error(`Failed to download media (${mediaType})`, e);
          }
        }
        // B. STRUCTURED MEDIA (No download, just data extraction)
        else if (mediaType === "location") {
          const loc = msg.message?.locationMessage;
          mediaInfo = {
            type: "location",
            latitude: loc?.degreesLatitude,
            longitude: loc?.degreesLongitude,
            name: loc?.name,
            address: loc?.address,
            url: loc?.url, // Sometimes contains Google Maps URL
          };
        } else if (mediaType === "contact") {
          mediaInfo = {
            type: "contact",
            displayName: msg.message?.contactMessage?.displayName,
            vcard: msg.message?.contactMessage?.vcard,
          };
        } else if (mediaType === "contact_list") {
          mediaInfo = {
            type: "contact_list",
            contacts: msg.message?.contactsArrayMessage?.contacts?.map((c) => ({
              displayName: c.displayName,
              vcard: c.vcard,
            })),
          };
        }
      }

      // 🧠 SMART NAME RESOLUTION (Outbound & Inbound)
      let finalContactName = msg.pushName;
      if (isOutbound) {
        // Try to get name from store since pushName is undefined for self
        const store = this.stores.get(sessionId);
        // Try fetching by JID or LID
        const contact =
          store?.contacts[remoteJid] || store?.contacts[msg.key.remoteJid];
        finalContactName =
          contact?.name || contact?.notify || contact?.verifiedName;
      }

      console.log(
        `[handleIncomingMessage] 📍 Step 5: Delegating to messageProcessor`
      );
      console.log(`[handleIncomingMessage] 🔍 Payload:`, {
        companyId: sessionRecord.companyId,
        sessionId,
        remoteJid,
        text: text || `[${mediaType.toUpperCase()}]`,
        isOutbound,
        hasMedia: !!mediaInfo,
      });

      // Delegate to Message Processor
      const { messageProcessor } = await import("./messageProcessor.service");
      await messageProcessor.process({
        companyId: sessionRecord.companyId,
        sessionId,
        remoteJid,
        text: text || `[${mediaType.toUpperCase()}]`,
        isOutbound,
        contactName: finalContactName, // Use resolved name
        hasMedia: !!mediaInfo,
        media: mediaInfo,
        profilePicUrl,
        about,
        originalLid: isLid ? msg.key.remoteJid : undefined, // 🧬 PASS LID FOR MERGE
      });

      console.log(
        `[handleIncomingMessage] ✅ Message processing completed successfully`
      );
    } catch (err: any) {
      console.error("❌ [handleIncomingMessage] FATAL ERROR:", err);
      console.error("❌ Stack:", err?.stack);
      Logger.error("Error handling message", err);
    }
  }

  // --- PUBLIC ADMINISTRATIVE METHODS (Restored) ---

  /**
   * List all sessions for a company with real-time status
   */
  public async listSessions(companyId: string) {
    const sessions = await prisma.whatsAppSession.findMany({
      where: { companyId },
    });

    return sessions.map((s) => ({
      ...s,
      isConnected: this.sessions.has(s.sessionId) && s.status === "CONNECTED",
    }));
  }

  /**
   * Create (or re-initialize) a session manually
   */
  public async createSession(companyId: string, sessionId?: string) {
    const id = sessionId || `session_${companyId}_${Date.now()}`;

    // Create/Upsert DB Record
    await prisma.whatsAppSession.upsert({
      where: { sessionId: id },
      update: { status: "DISCONNECTED", companyId },
      create: { sessionId: id, companyId, status: "DISCONNECTED" },
    });

    // Start
    this.initializeSession(id);
    return id;
  }

  /**
   * Delete and Disconnect a session
   */
  public async deleteSession(sessionId: string) {
    const sock = this.sessions.get(sessionId);
    if (sock) {
      try {
        sock.end(undefined);
        this.sessions.delete(sessionId);
      } catch (e) {
        Logger.error(`[WhatsApp] Error disconnecting session ${sessionId}`, e);
      }
    }

    await this.handleSessionFailure(sessionId);
    await this.clearSessionData(sessionId);

    try {
      await prisma.whatsAppSession.delete({ where: { sessionId } });
    } catch (e) {
      // Ignore if already deleted
    }

    return true;
  }

  /**
   * Get single session status
   */
  public async getSession(sessionId: string) {
    const session = await prisma.whatsAppSession.findUnique({
      where: { sessionId },
    });
    if (!session) return null;

    return {
      ...session,
      isConnected:
        this.sessions.has(sessionId) && session.status === "CONNECTED",
    };
  }

  /**
   * Send Outbound Message
   */
  /**
   * Send Outbound Message (SaaS Quality)
   * 1. Validates
   * 2. Sends via Baileys
   * 3. Persists to DB
   * 4. Emits Real-time Event
   */

  /**
   * 🎵 Converts any audio buffer to WhatsApp-compatible OGG Opus (PTT)
   * This ensures the green waveform appears on mobile devices.
   */
  private async convertAudioToOgg(inputBuffer: Buffer): Promise<Buffer> {
    return new Promise(async (resolve, reject) => {
      const id = Date.now() + Math.random().toString(36).substr(2, 5);
      const inputPath = path.join(tmpdir(), `input_${id}.webm`); // Assume WebM input
      const outputPath = path.join(tmpdir(), `output_${id}.ogg`);

      try {
        // 1. Write Input File
        await fsWriteFile(inputPath, inputBuffer);

        // 2. Transcode
        ffmpeg(inputPath)
          .toFormat("ogg")
          .audioCodec("libopus")
          .audioBitrate("64k") // WhatsApp Spec
          .audioChannels(1) // Mono forced required for PTT waveform
          .on("end", async () => {
            // 3. Read Output
            try {
              const outputBuffer = await readFile(outputPath);
              resolve(outputBuffer);
            } catch (e) {
              reject(e);
            } finally {
              // 4. Cleanup
              await unlink(inputPath).catch(() => {});
              await unlink(outputPath).catch(() => {});
            }
          })
          .on("error", async (err) => {
            console.error("[FFMPEG] Conversion Error:", err);
            // Cleanup
            await unlink(inputPath).catch(() => {});
            await unlink(outputPath).catch(() => {});
            reject(err);
          })
          .save(outputPath);
      } catch (e) {
        reject(e);
      }
    });
  }

  public async sendMessage(
    to: string,
    text: string,
    options: {
      companyId: string;
      conversationId: string; // REQUIRED for persistence
      senderId: string; // REQUIRED for persistence
      channelId?: string;
      media?: any;
      metadata?: any; // ✅ NEW: Support for AI metadata
    }
  ): Promise<any> {
    const { companyId, channelId, conversationId, senderId, media, metadata } =
      options;

    // 🔍 CRITICAL DEBUG
    console.log("🎯 [WhatsApp.sendMessage] Received params:", {
      to,
      hasMedia: !!media,
      mediaType: media?.type,
      mediaUrlLength: media?.url?.length,
    });

    // 1. Validation (REMOVED STRICT CHECKS TO ALLOW LIDs)
    // We now allow "Permissive Fallback" so we can reply to contacts even if they are LIDs (15+ digits).
    const cleanPhone = to.replace(/[^\d]/g, "");

    // Previous validation block removed to support LIDs.

    // ✅ QUEUE SYSTEM: Route media to queue, text goes direct
    // TODO: Re-enable after debugging worker initialization issue
    // if (media && media.url) {
    //   Logger.info(`[WhatsApp] 📥 Enqueuing media message to queue`);
    //   const { messageQueueService } = await import(
    //     "./queue/messageQueue.service"
    //   );
    //
    //   const jobId = await messageQueueService.enqueue({
    //     companyId,
    //     conversationId,
    //     senderId,
    //     to: cleanPhone,
    //     text,
    //     media,
    //   });
    //
    //   Logger.info(`[WhatsApp] ✅ Message enqueued with job ID: ${jobId}`);
    //
    //   // Return placeholder while queue processes
    //   return {
    //     id: `queued_${jobId}`,
    //     status: "QUEUED",
    //     jobId,
    //   };
    // }

    // ALL messages (text + media) sent immediately
    Logger.info(`[WhatsApp] 📤 Sending message immediately`);

    // 2. Find Correct Session
    let sock: WASocket | undefined;
    let currentSessionId: string | undefined;

    if (channelId) {
      const session = await prisma.whatsAppSession.findFirst({
        where: {
          companyId,
          OR: [{ phone: channelId }, { sessionId: channelId }],
          status: "CONNECTED",
        },
      });
      if (session) {
        sock = this.sessions.get(session.sessionId);
        currentSessionId = session.sessionId;
      }
    }

    if (!sock) {
      // 2.1 Try to find any active session in memory for this company
      const sessions = await prisma.whatsAppSession.findMany({
        where: { companyId, status: "CONNECTED" },
      });

      for (const s of sessions) {
        if (this.sessions.has(s.sessionId)) {
          sock = this.sessions.get(s.sessionId);
          currentSessionId = s.sessionId;
          break;
        }
      }

      // 2.2 SELF-HEALING: If no memory session but DB says connected, revive it!
      if (!sock && sessions.length > 0) {
        const victim = sessions[0]; // Take the first one
        Logger.warn(
          `[WhatsApp] 🚑 Session ${victim.sessionId} indicates CONNECTED in DB but missing in memory. Attempting lazy revival...`
        );

        if (!this.initializingSessions.has(victim.sessionId)) {
          this.initializeSession(victim.sessionId).catch((e) =>
            console.error(e)
          );
        }

        // Wait up to 3 seconds for binding
        let attempts = 0;
        while (!this.sessions.has(victim.sessionId) && attempts < 15) {
          await new Promise((r) => setTimeout(r, 200));
          attempts++;
        }

        if (this.sessions.has(victim.sessionId)) {
          sock = this.sessions.get(victim.sessionId);
          currentSessionId = victim.sessionId;
          Logger.info(
            `[WhatsApp] 🚑 Revival successful for ${victim.sessionId}`
          );
        }
      }
    }

    if (!sock) {
      Logger.error(`[WhatsApp] No active session for company ${companyId}`);
      throw new Error("No active WhatsApp session found");
    }

    // Baileys handles connection state internally, no need to wait

    // Use provided JID if it has a domain (e.g. @lid), otherwise assume phone number
    const jid = to.includes("@") ? to : `${cleanPhone}@s.whatsapp.net`;

    // 3. SEND via Baileys
    try {
      if (media && media.url) {
        Logger.info(
          `[WhatsApp] 🎬 Processing media: type=${
            media.type
          }, url=${media.url?.substring(0, 50)}...`
        );

        // ✅ ARCHITECTURE: S3 for storage, Buffer for WhatsApp
        let mediaBuffer: Buffer | { url: string };
        let s3Url = media.url;

        // 1. If base64, convert and upload to S3
        if (media.url.startsWith("data:")) {
          Logger.info(`[WhatsApp] 🔄 Converting base64 to Buffer...`);
          const base64Data = media.url.split(",")[1];
          mediaBuffer = Buffer.from(base64Data, "base64");

          try {
            const { storageService } = await import("./storageService");
            const result = await storageService.uploadFile(
              mediaBuffer,
              media.name || `${media.type}-${Date.now()}.webm`,
              media.mimetype || "application/octet-stream",
              false
            );
            s3Url = result.url; // Signed URL
            media.url = s3Url; // Update for DB persistence
            Logger.info(
              `[WhatsApp] 📤 ${media.type.toUpperCase()} uploaded to S3: ${
                result.key
              }`
            );
          } catch (err) {
            Logger.error("[WhatsApp] Failed to upload media to S3:", err);
            throw new Error("Failed to upload media");
          }
        } else if (media.url.startsWith("http")) {
          // If URL, let Baileys download it
          mediaBuffer = { url: media.url };
        } else {
          throw new Error("Invalid media URL format");
        }

        // 2. Send to WhatsApp using appropriate method
        if (media.type === "image") {
          await sock.sendMessage(jid, {
            image: mediaBuffer,
            caption: text,
          });
        } else if (media.type === "video") {
          await sock.sendMessage(jid, {
            video: mediaBuffer,
            caption: text,
          });
        } else if (media.type === "document") {
          await sock.sendMessage(jid, {
            document: mediaBuffer,
            mimetype: media.mimetype,
            fileName: media.name || "file",
          });
        } else if (media.type === "audio") {
          // 🛠️ TRANSCODING ENABLED (FFMPEG)
          // Since we installed FFMPEG, we can now convert WebM -> OGG Opus
          // to support native Voice Notes on iOS/Android.

          let finalBuffer = mediaBuffer as Buffer;
          let finalMime = media.mimetype;
          const isPtt = !!media.isVoiceNote;

          // Attempt conversion if it's a Buffer and PTT
          if (isPtt && Buffer.isBuffer(finalBuffer) && ffmpegPath) {
            try {
              Logger.info(`[WhatsApp] 🎵 Converting Voice Note to OGG Opus...`);
              finalBuffer = await this.convertAudioToOgg(finalBuffer);
              finalMime = "audio/ogg; codecs=opus";
              Logger.info(
                `[WhatsApp] ✅ Conversion success! New Size: ${finalBuffer.length}`
              );
            } catch (e) {
              Logger.warn(
                `[WhatsApp] ⚠️ Audio conversion failed, fallback to original: ${e}`
              );
            }
          }

          // 🌊 WAVEFORM GENERATION & DURATION
          // WhatsApp requires specific metadata to render the player correctly.
          // 1. Waveform: Array of 64 bytes representing amplitude (0-255). High contrast needed.
          const waveform = isPtt
            ? new Uint8Array(64).map(() => Math.floor(Math.random() * 256))
            : undefined;

          // 2. Duration (Seconds): Critical for the UI to show the time bar.
          // Estimate based on Opus 64kbps bitrate: Size (bytes) * 8 bits / 64000 bps
          const estimatedSeconds = isPtt
            ? Math.ceil((finalBuffer.length * 8) / 64000)
            : undefined;

          Logger.info(
            `[WhatsApp] 🎙️ PTT Metadata: Duration ~${estimatedSeconds}s, Waveform generated.`
          );

          // Send as proper PTT (Voice Note)
          await sock.sendMessage(jid, {
            audio: finalBuffer,
            mimetype: finalMime || "audio/mp4",
            ptt: isPtt,
            waveform: waveform,
            seconds: estimatedSeconds,
          } as any);
        }
      } else {
        await sock.sendMessage(jid, { text });
      }

      Logger.info(`[WhatsApp] ✅ Sent to ${cleanPhone}`);

      // 🧠 AGGRESSIVE PERSISTENCE: Check if this contact has a LID in store and persist it
      try {
        const store = this.stores.get(currentSessionId);
        if (store && store.contacts) {
          // Try to find the contact by JID variations
          const possibleJids = [
            `${cleanPhone}@s.whatsapp.net`,
            `${cleanPhone}@lid`,
            jid,
          ];

          for (const tryJid of possibleJids) {
            const contact = store.contacts[tryJid];
            if (contact && contact.lid) {
              // Found a LID! Persist it
              this.persistLidMapping(
                currentSessionId,
                cleanPhone,
                contact.lid
              ).catch(() => {});
              break;
            }
          }
        }
      } catch (e) {
        // Non-blocking
      }

      // 4. PERSIST to DB (Crucial Step: STATUS SENT)
      const message = await prisma.message.create({
        data: {
          content: text || (media ? `[${media.type.toUpperCase()}]` : ""),
          channel: "WHATSAPP",
          direction: "OUTBOUND",
          status: "SENT", // ✅ Explicit Status
          conversationId,
          senderId,
          metadata: media ? { ...metadata, media } : metadata,
        },
        include: { sender: true },
      });

      // 5. NO EMIT SOCKET FOR AGENT MESSAGES
      // Frontend already receives the message in HTTP response
      // Emitting here would cause duplication in the UI
      // Socket events are ONLY for INBOUND messages from customers

      // COMENTADO PARA EVITAR DUPLICACIÓN:
      // const io = gateway.getIO();
      // if (io) {
      //   const socketPayload = {
      //     ...message,
      //     senderType: "AGENT",
      //     ticketId: conversationId,
      //   };
      //   io.to(conversationId).emit("conversation.new_message", socketPayload);
      //   io.to(conversationId).emit("message", socketPayload);
      //   io.to(`company:${companyId}`).emit("conversation.updated", {
      //     id: conversationId,
      //     lastMessage: text,
      //     lastMessageAt: new Date(),
      //     unreadCount: 0,
      //   });
      // }

      // 5. EMIT Real-Time Event (Restored)
      const io = gateway.getIO();
      if (io) {
        const socketPayload = {
          ...message,
          senderType: "AGENT",
          ticketId: conversationId,
        };
        io.to(conversationId).emit("conversation.new_message", socketPayload);
        io.to(conversationId).emit("message", socketPayload);
        io.to(`company:${companyId}`).emit("conversation.updated", {
          id: conversationId,
          lastMessage: text,
          lastMessageAt: new Date(),
          unreadCount: 0,
        });
      }

      Logger.info(`[WhatsApp] ✅ Message saved, emitted and returned`);

      return message; // ✅ Return DB Object
    } catch (err: any) {
      Logger.error(`[WhatsApp] Send or Persistence failed to ${jid}`, err);

      // 🚑 SELF-HEALING: If session is broken, attempt to fix it for next time
      const isSessionError =
        err.message?.includes("SessionError") ||
        err.message?.includes("Socket closed") ||
        err.message?.includes("No sessions") ||
        err.message?.includes("Connection Closed");

      // @ts-ignore
      if (isSessionError && currentSessionId) {
        Logger.warn(
          // @ts-ignore
          `[WhatsApp] 🚑 Detecting broken session ${currentSessionId}. Triggering re-initialization.`
        );
        // Don't await, let it happen in background
        // @ts-ignore
        this.sessions.delete(currentSessionId); // Clear bad reference immediately
        // @ts-ignore
        this.initializeSession(currentSessionId).catch((e) => console.error(e));
      }

      throw err; // ✅ Force Error Propagation
    }
  }

  /**
   * PUBLIC: Get session for a company
   * Used by queue worker to check session readiness
   */
  public getSessionSocket(companyId: string): any {
    for (const [sessionId, sock] of this.sessions.entries()) {
      if (sessionId.includes(companyId)) {
        return sock;
      }
    }
    return null;
  }

  /**
   * PUBLIC: Send message directly (bypassing queue)
   * Used by queue worker after media is uploaded
   */
  public async sendMessageDirect(
    to: string,
    text: string,
    options: {
      companyId: string;
      conversationId: string;
      senderId: string;
      channelId?: string;
      media?: any;
    }
  ): Promise<any> {
    // This calls the current sendMessage implementation
    return this.sendMessage(to, text, options);
  }
  /**
   * 🔄 SYNC OLD MESSAGES (From Memory Store)
   * Fetches up to 50 messages per chat from the Baileys RAM Cache.
   * Note: This only works for messages received since the bot was started/synced.
   */
  public async syncMessages(companyId: string, fromDate: Date) {
    Logger.info(
      `[Sync] Starting sync for ${companyId} since ${fromDate.toISOString()}`
    );

    const sessions = await prisma.whatsAppSession.findMany({
      where: { companyId },
    });

    // Prioritize CONNECTED, then SCANNING, then others
    let session = sessions.find((s) => s.status === "CONNECTED") || sessions[0];

    if (!session) {
      throw new Error("No WhatsApp session found. Please link a device first.");
    }

    // 🚑 SELF-HEALING: Auto-Reconnect if Disconnected
    if (session.status !== "CONNECTED") {
      Logger.warn(
        `[Sync] Session ${session.sessionId} is ${session.status}. Attempting AUTO-RECONNECT...`
      );

      try {
        await this.initializeSession(session.sessionId);

        // Wait up to 45s for connection (Baileys history sync timeout is 20s, so we need more)
        let attempts = 0;
        while (attempts < 45) {
          await new Promise((r) => setTimeout(r, 1000));
          const freshSession = await prisma.whatsAppSession.findUnique({
            where: { sessionId: session.sessionId },
          });
          if (freshSession?.status === "CONNECTED") {
            Logger.info(
              `[Sync] ✅ Auto-reconnect successful for ${session.sessionId}`
            );
            session = freshSession; // Update reference

            // 🕒 Wait extra 10s for History Sync (Store population)
            // Baileys buffers messages during 'AwaitingInitialSync'. When it goes 'Online', it flushes them.
            Logger.info(`[Sync] Waiting 10s for WhatsApp History Flush...`);
            await new Promise((r) => setTimeout(r, 10000));
            break;
          }
          attempts++;
        }

        if (session.status !== "CONNECTED") {
          throw new Error(
            "Auto-reconnect failed. Please reconnect manually via Dashboard."
          );
        }
      } catch (e: any) {
        Logger.error(`[Sync] Auto-healing failed:`, e);
        throw new Error(
          `Session is disconnected and auto-reconnect failed: ${e.message}`
        );
      }
    }

    const store = this.stores.get(session.sessionId);
    if (!store) {
      Logger.warn(
        `[Sync] Store not found for ${session.sessionId}. Force-initializing store...`
      );
      // Fallback: If store handling failed during init
      return {
        chats: 0,
        messages: 0,
        warning:
          "Message cache unavailable even after connect. Try again in 1 minute.",
      };
    }

    const { messageProcessor } = await import("./messageProcessor.service");
    let importedCount = 0;
    let chatsCount = 0;

    // Get all chats from store
    // Check if store.chats is accessible (it should be KeyedDB)
    const chats = store.chats.all ? store.chats.all() : [];
    chatsCount = chats.length;
    Logger.info(`[Sync] Found ${chatsCount} chats in RAM store.`);

    for (const chat of chats) {
      const jid = chat.id;
      // Access messages from store (KeyedDB)
      // @ts-ignore
      const messagesKeyedDB = store.messages[jid];
      const messages = messagesKeyedDB ? messagesKeyedDB.array : [];

      // Filter by Date
      const eligible = messages.filter((m: any) => {
        if (!m.messageTimestamp) return false;
        const rawTs =
          typeof m.messageTimestamp === "number"
            ? m.messageTimestamp
            : m.messageTimestamp.low;
        const ts = rawTs * 1000;
        return ts >= fromDate.getTime();
      });

      if (messages.length > 0) {
        Logger.info(
          `[Sync] Chat ${jid.slice(0, 15)}...: ${
            messages.length
          } msgs total. Eligible: ${
            eligible.length
          } (Filter: ${fromDate.toISOString()})`
        );
      }

      // Get last 50, chronological
      // Baileys array is usually chronological? Or we should sort?
      // Assuming safely sorted, take last 50.
      const toImport = eligible.slice(-50);

      // 🚀 Optimize: Process messages in parallel batches
      const batchSize = 10;
      for (let i = 0; i < toImport.length; i += batchSize) {
        const batch = toImport.slice(i, i + batchSize);
        await Promise.all(
          batch.map(async (msg: any) => {
            try {
              const isOutbound = msg.key.fromMe || false;

              // Basic text extraction
              let text =
                msg.message?.conversation ||
                msg.message?.extendedTextMessage?.text ||
                "";
              let mediaType = "";

              if (msg.message?.imageMessage) {
                mediaType = "image";
                text = msg.message.imageMessage.caption || text || "[IMAGE]";
              } else if (msg.message?.audioMessage) {
                mediaType = "audio";
                text = "[AUDIO]";
              } else if (msg.message?.videoMessage) {
                mediaType = "video";
                text = msg.message.videoMessage.caption || text || "[VIDEO]";
              } else if (msg.message?.documentMessage) {
                mediaType = "document";
                text =
                  msg.message.documentMessage.caption || text || "[DOCUMENT]";
              }

              if (!text && !mediaType) return;

              // Note: Skip heavy media download for sync speed
              await messageProcessor.process({
                companyId,
                sessionId: session.sessionId,
                remoteJid: jid,
                text: text,
                isOutbound,
                contactName: msg.pushName,
              });
              importedCount++;
            } catch (e: any) {
              Logger.warn(
                `[Sync] Failed to process message ${msg.key.id}: ${e.message}`
              );
            }
          })
        );
      }
    }

    Logger.info(`[Sync] Completed. Imported ${importedCount} messages.`);
    return { chats: chatsCount, messages: importedCount };
  }
}

export const whatsappService = new WhatsAppService();
