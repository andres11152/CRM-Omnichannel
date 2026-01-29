import { prisma } from "@/config/database";
import { gateway } from "@/gateways/socketGateway";
import {
  Prisma,
  MessageDirection,
  Channel,
  UserRole,
  User,
} from "@prisma/client";
import bcrypt from "bcryptjs";
import { retryWithBackoff } from "@/utils/resilience";
import { getErrorMessage } from "@/utils/errorHelpers";
import { Logger } from "@/utils/logger";
import { DistributedLock } from "@/utils/distributedLock";
import { ContactStrategy } from "@/utils/contactStrategy";
import type {
  IncomingMessagePayload,
  SocketDashboardPayload,
  ConversationWithQueue,
  MessageWithSender,
} from "../interfaces/MessageTypes";

/**
 * 🛡️ TYPE GUARD
 * Ensures error is handled safely without 'any' casting
 */
function isPrismaError(
  error: unknown,
): error is Prisma.PrismaClientKnownRequestError {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    "clientVersion" in error
  );
}

/**
 * 🛡️ TYPE DEFINITIONS (Strict & Scalable)
 */
// Interface moved to @/interfaces/MessageTypes.ts

/**
 * 🧠 UTILITY: JID Normalizer
 * Converts messy JIDs (12345:11@s.whatsapp.net) into clean ints (12345)
 */
const normalizeJid = (jid: string): string | null => {
  if (!jid) return null;
  let clean = jid.split("@")[0].split(":")[0];
  clean = clean.replace(/\D/g, "");

  // 🛡️ BLOCK UNRESOLVED LIDs (15-20 digits)
  if (clean.length > 14) {
    Logger.warn(`[normalizeJid] 🛑 Rejected Unresolved LID: ${clean}`);
    return null;
  }

  // Basic phone number validation (minimum 7 digits)
  if (clean.length < 7) {
    Logger.warn(`[normalizeJid] ⚠️ Rejected short number: ${clean}`);
    return null;
  }

  return clean;
};

export const messageProcessor = {
  /**
   * 🚀 ENTRY POINT
   * Using Distributed Locking to ensure concurrency safety across clusters.
   */
  async process(payload: IncomingMessagePayload) {
    const { remoteJid, companyId, originalLid } = payload;
    const phone = normalizeJid(remoteJid);

    if (!phone) {
      Logger.error(`[MsgProcessor] 🛑 Blocking Message: Unresolved JID/LID`, {
        remoteJid,
        originalLid,
      });
      return;
    }

    const sanitizedPayload = { ...payload, remoteJid: phone };
    const lockKey = `conv:${companyId}:${phone}`;

    try {
      // 🔒 DISTRIBUTED LOCK EXECUTION
      await DistributedLock.run(
        lockKey,
        async () => {
          await this._processSafeInternal(sanitizedPayload);
        },
        5000, // 5s TTL
        10000, // 10s Timeout
      );
    } catch (error) {
      Logger.error(
        `[MsgProcessor] Lock Acquisition Failed or Processing Error`,
        error,
      );
    }
  },

  /**
   * 🔒 CORE LOGIC
   * Refactored for Atomic Consistency and Strategy Pattern
   */
  async _processSafeInternal(payload: IncomingMessagePayload) {
    try {
      const {
        companyId,
        sessionId,
        remoteJid: phone,
        text,
        isOutbound,
        hasMedia,
        media,
      } = payload;

      Logger.info(
        `[MsgProcessor] ⚡ Processing ${
          isOutbound ? "OUT" : "IN"
        } | Phone: ${phone}`,
      );

      // 1. STRATEGY: Resolve Identity (No more inline logic)
      const identity = ContactStrategy.resolveName(
        phone,
        payload.contactName || payload.senderName,
        isOutbound,
      );

      // 2. ATOMIC DB OPERATIONS (Contact -> User -> Conversation)
      // We use a "Find then Upsert" pattern instead of full transaction for reads/writes
      // to avoid deadlocks on high concurrency, but Critical Mutations are safe via Lock.

      // A. CONTACT HANDLING
      // A. CONTACT HANDLING
      // 🕵️ Flexible Search: Handle cases where admin manually created contact with "+" prefix
      let contact = await prisma.contact.findFirst({
        where: {
          companyId,
          phone: { in: [phone, `+${phone}`] },
        },
      });

      // 🧹 Normalization Fix: If found with "+", clean it immediately
      if (contact && contact.phone !== phone) {
        Logger.info(
          `[MsgProcessor] 🧹 Normalizing Contact Phone (removing +): ${contact.phone} -> ${phone}`,
        );
        contact = await prisma.contact.update({
          where: { id: contact.id },
          data: { phone: phone },
        });
      }

      if (contact) {
        // Update Name if better (and valid)
        if (identity.contactName && !isOutbound) {
          // Check if current name is generic/phone done by strategy logic implicitly?
          // We blindly update IF valid. Strategy ensures we don't save garbage.
          // But we must check if current name is NOT better?
          // "Better" = Human Name.

          const currentNameIsPhone = contact.name === phone || !contact.name;
          if (currentNameIsPhone && contact.name !== identity.contactName) {
            Logger.info(
              `[MsgProcessor] ♻️ Upgrading Contact Name: ${identity.contactName}`,
            );
            contact = await prisma.contact.update({
              where: { id: contact.id },
              data: { name: identity.contactName },
            });
          }
        }
      } else {
        // Merge Strategy (LID)
        let legacyContact = null;
        if (payload.originalLid) {
          legacyContact = await prisma.contact.findFirst({
            where: { companyId, phone: payload.originalLid },
          });
        }

        if (legacyContact) {
          Logger.info(
            `[MsgProcessor] 🔄 Merging Legacy LID: ${payload.originalLid} -> ${phone}`,
          );
          contact = await prisma.contact.update({
            where: { id: legacyContact.id },
            data: {
              phone: phone,
              ...(identity.contactName && { name: identity.contactName }),
            },
          });
        } else {
          // Create New Contact
          Logger.info(
            `[MsgProcessor] 👤 Creating Contact (Safe): ${identity.subjectDisplayName}`,
          );
          try {
            contact = await prisma.contact.create({
              data: {
                companyId,
                phone,
                name: identity.contactName, // Undefined if invalid
                tags: ["WHATSAPP_LEAD"],
              },
            });
          } catch (error: any) {
            // 🛡️ RACE CONDITION HANDLER: If contact was created ms ago by another process
            if (error.code === "P2002") {
              Logger.info(
                `[MsgProcessor] ♻️ Contact already exists (Race Condition): ${phone}. Fetching existing.`,
              );

              // 🧟 ZOMBIE CHECK: Bypass middleware to find even soft-deleted contacts
              contact = await prisma.contact.findFirst({
                where: { companyId, phone },
                includeDeleted: true,
              } as any);

              if (contact) {
                // 🚑 Restore & Self-Healing
                // Whether zombie or active, we update it to ensure name/phone are correct
                const isZombie = !!contact.deletedAt;

                if (isZombie) {
                  Logger.info(
                    `[MsgProcessor] 🚑 Restoring 'Zombie' Contact: ${phone} (ID: ${contact.id})`,
                  );
                } else {
                  Logger.info(
                    `[MsgProcessor] ♻️ Found existing contact. Refreshing data for: ${phone}`,
                  );
                }

                // Force update to fix "Wrong Number" issues / Name updates
                await prisma.contact.update({
                  where: { id: contact.id },
                  data: {
                    deletedAt: null,
                    name: identity.contactName || contact.name,
                    phone: phone, // 🛡️ Self-heal: Ensure DB has normalized phone
                  },
                });

                // Update local object
                contact.deletedAt = null;
                if (identity.contactName) contact.name = identity.contactName;
              } else {
                Logger.error(
                  `[MsgProcessor] ❌ PHANTOM ERROR: P2002 for ${phone}, but findFirst(includeDeleted) returned NULL.`,
                );
                throw error;
              }
            } else {
              throw error; // Rethrow other errors
            }
          }
        }
      }

      // 2.5 PERSIST LID MAPPING
      if (contact && payload.originalLid) {
        const currentFields =
          (contact.customFields as Record<string, unknown>) || {};
        if (currentFields.lid !== payload.originalLid) {
          // Non-blocking update
          console.log(`[MsgProcessor] 💾 Persisting LID mapping`);
          await prisma.contact
            .update({
              where: { id: contact.id },
              data: {
                customFields: { ...currentFields, lid: payload.originalLid },
              },
            })
            .catch((e) => console.warn("LID map save failed", e));
        }
      }

      // B. USER HANDLING (Upsert)
      const userEmail = `${phone}@whatsapp.user`;
      const userUpdateData: any = { phone };
      if (!isOutbound) {
        userUpdateData.name = identity.subjectDisplayName;
        if (payload.profilePicUrl)
          userUpdateData.profilePicUrl = payload.profilePicUrl;
        if (payload.about) userUpdateData.about = payload.about;
      }

      const user = await prisma.user.upsert({
        where: { email: userEmail },
        update: userUpdateData,
        create: {
          companyId,
          email: userEmail,
          name: identity.subjectDisplayName,
          phone,
          role: UserRole.USER,
          password: await bcrypt.hash(phone, 10),
          profilePicUrl: payload.profilePicUrl,
          about: payload.about,
        },
      });

      // C. CONVERSATION HANDLING - DETERMINISTIC & RESILIENT
      // 🎯 STRATEGY: Use UNIQUE constraint for atomic conversation lookup
      // This prevents race conditions and duplicate conversations

      const normalizedPhone = phone; // Already normalized by normalizeJid

      // 1️⃣ PRIMARY LOOKUP: Search by normalized phone (Single Source of Truth)
      let conversation = await prisma.conversation.findFirst({
        where: {
          companyId,
          channelId: normalizedPhone,
        },
        orderBy: { createdAt: "desc" },
      });

      // 2️⃣ LEGACY MIGRATION: If not found, check for old LID-based conversation
      if (!conversation && payload.originalLid) {
        Logger.info(
          `[MsgProcessor] 🔍 Searching for legacy LID conversation: ${payload.originalLid}`,
        );

        const legacyConversation = await prisma.conversation.findFirst({
          where: {
            companyId,
            channelId: payload.originalLid,
          },
        });

        if (legacyConversation) {
          Logger.info(
            `[MsgProcessor] 🔄 MIGRATING Legacy LID Conversation: ${payload.originalLid} → ${normalizedPhone}`,
          );

          try {
            // ATOMIC UPDATE: Migrate LID to real phone
            conversation = await prisma.conversation.update({
              where: { id: legacyConversation.id },
              data: {
                channelId: normalizedPhone,
                subject: identity.subjectDisplayName, // Update name too
              },
            });

            Logger.info(
              `[MsgProcessor] ✅ Migration successful: Conversation ${conversation.id}`,
            );
          } catch (error: unknown) {
            // Handle race condition: Another process might have migrated it already
            if (isPrismaError(error) && error.code === "P2002") {
              Logger.warn(
                `[MsgProcessor] ⚠️ Conversation already migrated by another process. Re-fetching...`,
              );
              conversation = await prisma.conversation.findFirst({
                where: {
                  companyId,
                  channelId: normalizedPhone,
                },
              });
            } else {
              throw error;
            }
          }
        }
      }

      // 2️⃣.5️⃣ FAILSAFE: Search by Contact ID (The "Wrong Number" Fix)
      if (!conversation && contact) {
        Logger.info(
          `[MsgProcessor] 🔍 Failsafe: Searching conversation by Contact ID: ${contact.id}`,
        );
        const contactConversation = await prisma.conversation.findFirst({
          where: { companyId, contactId: contact.id },
          orderBy: { updatedAt: "desc" },
        });

        if (contactConversation) {
          if (contactConversation.channelId !== normalizedPhone) {
            Logger.info(
              `[MsgProcessor] 🔄 MIGRATING Contact Conversation: ${contactConversation.channelId} -> ${normalizedPhone}`,
            );
            try {
              conversation = await prisma.conversation.update({
                where: { id: contactConversation.id },
                data: {},
              });
            } catch (error: unknown) {
              if (isPrismaError(error) && error.code === "P2002") {
                Logger.warn(
                  `[MsgProcessor] ⚠️ Migration Conflict: Good conversation exists. Using it.`,
                );
                conversation = await prisma.conversation.findFirst({
                  where: { companyId, channelId: normalizedPhone },
                });
              } else {
                throw error;
              }
            }
          } else {
            conversation = contactConversation;
          }
        }
      }

      // 3️⃣ CREATE NEW CONVERSATION (if still not found)
      if (!conversation) {
        Logger.info(
          `[MsgProcessor] 🆕 Creating new conversation for: ${normalizedPhone}`,
        );

        try {
          // Use transaction for atomic creation
          await prisma.$transaction(async (tx) => {
            // Queue Logic (Smart Assignment)
            let queueId: string | null = null;

            // Priority 1: Session's default queue
            if (sessionId) {
              const sessionConfig = await tx.whatsAppSession.findUnique({
                where: { sessionId },
                select: { defaultQueueId: true },
              });
              if (sessionConfig?.defaultQueueId) {
                queueId = sessionConfig.defaultQueueId;
              }
            }

            // Priority 2: First active queue (prefer AI-enabled)
            if (!queueId) {
              const queue = await tx.queue.findFirst({
                where: { companyId, isActive: true },
                orderBy: [
                  { aiAssistantId: { sort: "desc", nulls: "last" } },
                  { createdAt: "asc" },
                ],
              });
              if (queue) queueId = queue.id;
            }

            Logger.info(
              `[MsgProcessor] 🎯 Assigned Queue: ${queueId || "None (Manual)"}`,
            );

            // CREATE CONVERSATION
            conversation = await tx.conversation.create({
              data: {
                companyId,
                channelId: normalizedPhone, // ✅ ALWAYS use normalized phone
                subject: identity.subjectDisplayName,
                status: "OPEN",
                participants: { connect: [{ id: user.id }] },
                contactId: contact?.id, // Link to contact if exists
                queueId,
              },
            });

            // CREATE TICKET
            const lastTicket = await tx.ticket.findFirst({
              where: { companyId },
              orderBy: { ticketNumber: "desc" },
              select: { ticketNumber: true },
            });

            await tx.ticket.create({
              data: {
                companyId,
                ticketNumber: (lastTicket?.ticketNumber || 0) + 1,
                subject: identity.subjectDisplayName,
                description: "Chat iniciado en WhatsApp",
                status: "OPEN",
                priority: "MEDIUM",
                createdById: user.id,
                conversationId: conversation.id,
                queueId,
              },
            });

            Logger.info(
              `[MsgProcessor] ✅ Conversation created: ${conversation.id}`,
            );
          });
        } catch (error: unknown) {
          // Handle unique constraint violation (race condition)
          if (isPrismaError(error) && error.code === "P2002") {
            Logger.warn(
              `[MsgProcessor] ⚠️ Conversation created by another process during transaction. Re-fetching...`,
            );

            // Another process created it, fetch it
            conversation = await prisma.conversation.findFirst({
              where: {
                companyId,
                channelId: normalizedPhone,
              },
            });

            if (!conversation) {
              throw new Error(
                `Critical: Conversation should exist but not found after P2002`,
              );
            }
          } else {
            throw error;
          }
        }
      } else {
        // 4️⃣ UPDATE EXISTING CONVERSATION METADATA
        Logger.info(
          `[MsgProcessor] ♻️ Using existing conversation: ${conversation.id}`,
        );

        const updates: Prisma.ConversationUpdateInput = {};

        // Update contact link if missing
        if (!conversation.contactId && contact) {
          updates.contact = { connect: { id: contact.id } };
        }

        // Update subject if it's generic and we have a better name
        if (!isOutbound && identity.hasValidName && identity.contactName) {
          const isGenericSubject =
            conversation.subject === normalizedPhone ||
            /^~?\d+$/.test(conversation.subject || "");

          if (isGenericSubject) {
            updates.subject = identity.contactName;
          }
        }

        // Re-open if closed (customer sent new message)
        if (conversation.status !== "OPEN" && !isOutbound) {
          updates.status = "OPEN";
          Logger.info(`[MsgProcessor] 🔓 Re-opening conversation`);
        }

        // Apply updates if any
        if (Object.keys(updates).length > 0) {
          conversation = await prisma.conversation.update({
            where: { id: conversation.id },
            data: updates,
          });
        }
      }

      if (!conversation) {
        throw new Error("CRITICAL: Conversation should exist at this point");
      }

      // Determine Sender
      let senderId = user.id;
      if (isOutbound) {
        const admin = await prisma.user.findFirst({
          where: { companyId, role: { in: [UserRole.ADMIN, UserRole.MASTER] } },
        });
        if (admin) senderId = admin.id;
      }

      // Deduplication (Message Level)
      const recent = await prisma.message.findFirst({
        where: {
          conversationId: conversation.id,
          content: text,
          createdAt: { gt: new Date(Date.now() - 5000) }, // 5s dedupe
        },
      });

      if (recent) return;

      // SAVE MESSAGE
      const newMessage = await prisma.message.create({
        data: {
          // @ts-ignore: Pending 'prisma generate' restart to recognize 'companyId' in types
          companyId, // ✅ CRITICAL: Assign companyId explicitly for multi-tenancy visibility
          conversationId: conversation!.id,
          channel: Channel.WHATSAPP,
          direction: isOutbound
            ? MessageDirection.OUTBOUND
            : MessageDirection.INBOUND,
          content: text,
          senderId,
          metadata: hasMedia ? { media } : Prisma.JsonNull,
        },
        include: { sender: true },
      });

      // ✅ CRITICAL FIX: Explicitly update Conversation & Contact timestamps
      // This ensures 'lastMessageAt' logic is consistent across restarts/refreshes.
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: { updatedAt: new Date() },
      });

      if (contact) {
        await prisma.contact
          .update({
            where: { id: contact.id },
            data: { updatedAt: new Date() },
          })
          .catch((e) => console.warn("Contact update touch failed", e)); // Non-blocking
      }

      // EVENTS & AI
      this._emitSocketEvents(
        conversation,
        newMessage,
        identity.subjectDisplayName,
        companyId,
        isOutbound,
        user.id,
        user,
      );

      if (!isOutbound) {
        setImmediate(() => {
          this._handleAIAutoResponse(
            conversation!.id,
            newMessage.id,
            text,
            companyId,
          ).catch(Logger.error);
        });
      }
    } catch (error) {
      Logger.error(`[MsgProcessor] Fatal Error`, error);
    }
  },

  // 🤖 AI AUTO-RESPONSE HANDLER (Preserved)
  async _handleAIAutoResponse(
    conversationId: string,
    inboundMessageId: string,
    userMessage: string,
    companyId: string,
  ) {
    try {
      const conversation = await prisma.conversation.findUnique({
        where: { id: conversationId },
        include: {
          queue: { include: { aiAssistant: true } },
          messages: {
            where: { id: { not: inboundMessageId } },
            orderBy: { createdAt: "desc" },
            take: 10,
            include: { sender: true },
          },
        },
      });

      if (!conversation?.queue?.aiAssistant) return;

      const aiAssistant = conversation.queue.aiAssistant;
      const history = conversation.messages
        .slice()
        .reverse()
        .map((msg) => ({
          role: (msg.direction === "INBOUND" ? "user" : "model") as
            | "user"
            | "model",
          parts: msg.content,
        }));

      const { generateAIResponse } = await import("./aiResponseService");
      const aiResponseText = await generateAIResponse(
        companyId,
        aiAssistant.id,
        userMessage,
        history,
      );

      if (!aiResponseText) return;

      const botEmail = `ai_${aiAssistant.id}@reply.bot`;
      let botUser = await prisma.user.findUnique({
        where: { email: botEmail },
      });

      if (!botUser) {
        botUser = await prisma.user.create({
          data: {
            email: botEmail,
            name: aiAssistant.name,
            password: await bcrypt.hash(aiAssistant.id, 10),
            role: "AGENT",
            companyId,
          },
        });
      }

      // ♻️ REFACTOR: Use unified service
      const { whatsappService } = await import("../whatsapp");
      await whatsappService.sendMessage(
        conversation.channelId,
        aiResponseText,
        {
          companyId,
          conversationId,
          senderId: botUser.id,
          metadata: {
            aiGenerated: true,
            aiAssistantId: aiAssistant.id,
            aiAssistantName: aiAssistant.name,
          },
        },
      );
    } catch (error) {
      console.error(`[AI] Error:`, error);
    }
  },

  // 📡 SOCKET EMITTER (Preserved)
  _emitSocketEvents(
    conversation: ConversationWithQueue,
    message: MessageWithSender,
    displayName: string,
    companyId: string,
    isOutbound: boolean,
    contactId: string,
    user: User | null,
  ) {
    const io = gateway.getIO();
    if (!io) return;

    io.to(conversation.id).emit("conversation.new_message", message);

    const dashboardPayload: SocketDashboardPayload = {
      id: conversation.id,
      channel: "whatsapp",
      subject: displayName,
      lastMessage: message.content,
      lastMessageAt: message.createdAt,
      unreadCount: !isOutbound ? (conversation.unreadCount || 0) + 1 : 0,
      contact: {
        id: contactId,
        name: displayName, // User display name
        phone: conversation.channelId,
        avatarUrl: null,
        profilePicUrl: user?.profilePicUrl || null,
        about: user?.about || null,
      },
    };

    io.to(`company:${companyId}`).emit(
      "conversation.updated",
      dashboardPayload,
    );
  },
};
