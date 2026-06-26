import { IAuthProvider } from "../core/interfaces/IAuthProvider";
import {
  AuthenticationState,
  BufferJSON,
  initAuthCreds,
  SignalDataTypeMap,
  AuthenticationCreds,
  SignalKeyStore,
} from "@whiskeysockets/baileys";
import { whatsappCredentialRepository } from "@/repositories/WhatsAppCredentialRepository";
import redisClient from "@/config/redis";
import { encrypt, decrypt } from "@/utils/cryptoUtils";
import { Logger } from "@/utils/logger";


const REDIS_PREFIX = "wa:sess:";
const REDIS_TTL = 60 * 60 * 24; // 24 hours

/**
 * [RESILIENCE] In-memory promise queue to serialize database operations per session.
 * This guarantees that concurrent updates (e.g. keys.set, saveCredentials) do not trigger
 * concurrent database transactions/lock conflicts for the same sessionId, protecting pool capacity.
 */
class SessionQueue {
  private static queues = new Map<string, Promise<unknown>>();

  static async enqueue<T>(sessionId: string, task: () => Promise<T>): Promise<T> {
    const previous = this.queues.get(sessionId) || Promise.resolve();
    const next = (async () => {
      try {
        await previous;
      } catch {
        // Safe fallback: ignore previous task errors to avoid deadlocks
      }
      return await task();
    })();
    this.queues.set(sessionId, next);

    next.finally(() => {
      if (this.queues.get(sessionId) === next) {
        this.queues.delete(sessionId);
      }
    });

    return next;
  }
}

export class DatabaseAuthProvider implements IAuthProvider {
  async loadState(sessionId: string): Promise<{
    state: AuthenticationState;
    saveCreds: () => Promise<void>;
  }> {
    const creds = await this.loadCreds(sessionId);

    // [SEC] RESILIENCE: If root credentials exist in the database but cannot be decrypted,
    // the SESSION_SECRET is likely mismatched (e.g. running local dev against production DB).
    // Throwing an error prevents starting Baileys with blank keys, protecting database integrity.
    if (creds === null) {
      const exists = await whatsappCredentialRepository.findUnique(sessionId, "creds");
      if (exists) {
        throw new Error(
          `[AuthProvider] Decryption failed for session ${sessionId}. ` +
          `This is likely due to a mismatched SESSION_SECRET (e.g., local backend running against a production database with different keys) or data corruption. ` +
          `Aborting initialization to protect credentials.`
        );
      }
    }

    const keys: SignalKeyStore = {
      get: async (type, ids) => {
        const data: { [id: string]: SignalDataTypeMap[typeof type] } = {};
        const fullKeys = ids.map((id) => `${type}-${id}`);
        const missingKeys: string[] = [];

        // 1. Try Redis first (Batch Get)
        if (redisClient?.isOpen) {
          try {
            const redisKeys = fullKeys.map(
              (k) => `${REDIS_PREFIX}${sessionId}:${k}`,
            );
            // [RESILIENCE] Cap at 2.5s; fall back to DB for all keys on timeout so a
            // slow Redis can't stall Baileys' signal-key reads during messaging.
            const cachedValues = await Promise.race([
              redisClient.mGet(redisKeys),
              new Promise<null[]>((resolve) =>
                setTimeout(() => resolve(fullKeys.map(() => null)), 2500),
              ),
            ]);

            cachedValues.forEach((val, i) => {
              if (val) {
                const id = ids[i];
                try {
                  // Cached value is Encrypted -> Decrypt -> Parse
                  const decrypted = decrypt(val, sessionId);
                  if (decrypted) {
                    const parsed = JSON.parse(decrypted, BufferJSON.reviver);
                    if (parsed !== null && parsed !== undefined) {
                      data[id] = parsed;
                    }
                  }
                } catch {
                  Logger.warn(
                    `[AuthProvider] Cache parse error for ${fullKeys[i]} in session ${sessionId}`,
                  );
                }
              } else {
                missingKeys.push(fullKeys[i]);
              }
            });
          } catch (err) {
            Logger.warn("[AuthProvider] Redis MGET failed:", err);
            missingKeys.push(...fullKeys); // Fallback to DB for all
          }
        } else {
          missingKeys.push(...fullKeys);
        }

        // 2. Fetch missing keys from DB (Batch Query)
        if (missingKeys.length > 0) {
          const dbCredentials = await whatsappCredentialRepository.findMany(
            sessionId,
            missingKeys,
          );

          for (const cred of dbCredentials) {
            // cred.key format: "type-id" -> extract id
            const id = cred.key.replace(`${type}-`, "");
            if (cred.value) {
              try {
                // DB value is Encrypted -> Decrypt -> Parse
                const decrypted = decrypt(cred.value, sessionId);
                
                // [SEC] SECURITY: Only fallback to raw JSON if it doesn't look like encrypted data
                // This prevents trying to parse ciphertext as JSON when keys change.
                let rawJson: string | null = decrypted;
                if (!decrypted && !cred.value.includes(":")) {
                  rawJson = cred.value;
                }

                if (!rawJson) {
                  Logger.error(`[AuthProvider] Corrupted key ${cred.key} for ${sessionId}. Skipping.`);
                  continue;
                }

                const parsed = JSON.parse(rawJson, BufferJSON.reviver);
                if (parsed !== null && parsed !== undefined) {
                  data[id] = parsed;
                }

                // 3. Populate Cache (Read-Through) — fire-and-forget so Redis OOM never
                // propagates into Baileys' signal key retrieval and breaks encryption.
                if (redisClient?.isOpen && parsed !== null && parsed !== undefined) {
                  redisClient.set(
                    `${REDIS_PREFIX}${sessionId}:${cred.key}`,
                    cred.value,
                    { EX: REDIS_TTL },
                  ).catch((e) => Logger.warn(`[AuthProvider] Cache write-back skipped (${cred.key}):`, e));
                }
              } catch (e) {
                Logger.error(
                  `[AuthProvider] DB Parse error for ${cred.key} in ${sessionId}:`,
                  e,
                );
              }
            }
          }
        }

        return data;
      },

      set: async (data) => {
        return SessionQueue.enqueue(sessionId, async () => {
          const ops: Promise<unknown>[] = [];
          const redisMulti = redisClient?.isOpen ? redisClient.multi() : null;
          const dbUpserts: { sessionId: string; key: string; value: string }[] = [];
          const dbDeletes: string[] = [];
          const redisDeletes: string[] = [];

          for (const category of Object.keys(data)) {
            for (const id of Object.keys(data[category])) {
              const value = data[category][id];
              const key = `${category}-${id}`;

              if (value === null || value === undefined) {
                dbDeletes.push(key);
                redisDeletes.push(`${REDIS_PREFIX}${sessionId}:${key}`);
              } else {
                const json = JSON.stringify(value, BufferJSON.replacer);
                const encrypted = encrypt(json, sessionId);
                dbUpserts.push({ sessionId, key, value: encrypted });

                if (redisMulti) {
                  redisMulti.set(`${REDIS_PREFIX}${sessionId}:${key}`, encrypted, {
                    EX: REDIS_TTL,
                  });
                }
              }
            }
          }

          // Execute Redis Pipeline
          if (redisClient?.isOpen) {
            if (redisDeletes.length > 0) {
              ops.push(
                redisClient.del(redisDeletes).catch((e) => Logger.warn("Redis delete keys failed", e))
              );
            }
            if (redisMulti) {
              ops.push(
                redisMulti.exec().catch((e) => Logger.warn("Redis set failed", e)),
              );
            }
          }

          // Execute DB Upserts
          if (dbUpserts.length > 0) {
            ops.push(
              whatsappCredentialRepository
                .upsertMany(dbUpserts)
                .catch((e) =>
                  Logger.error(
                    `[AuthProvider] DB Upsert failed for ${sessionId}`,
                    e,
                  ),
                ),
            );
          }

          // Execute DB Deletes
          if (dbDeletes.length > 0) {
            ops.push(
              whatsappCredentialRepository
                .deleteKeys(sessionId, dbDeletes)
                .catch((e) =>
                  Logger.error(
                    `[AuthProvider] DB Delete failed for ${sessionId}`,
                    e,
                  ),
                ),
            );
          }

          await Promise.all(ops);
        });
      },
    };

    const state: AuthenticationState = {
      creds: creds || initAuthCreds(),
      keys,
    };

    return {
      state,
      saveCreds: async () => {
        await this.saveCredentials(sessionId, state.creds);
      },
    };
  }

  private async loadCreds(
    sessionId: string,
  ): Promise<AuthenticationCreds | null> {
    const key = "creds";

    // 1. Try Redis
    if (redisClient?.isOpen) {
      try {
        // [RESILIENCE] Cap the Redis read at 2.5s and fall through to the DB. A
        // slow/reconnecting Redis would otherwise hang here (try/catch only guards
        // errors, not slowness), blocking session init and QR generation.
        const cached = await Promise.race([
          redisClient.get(`${REDIS_PREFIX}${sessionId}:${key}`),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 2500)),
        ]);
        if (cached) {
          const decrypted = decrypt(cached, sessionId);
          if (decrypted) {
            return JSON.parse(decrypted, BufferJSON.reviver);
          }
        }
      } catch (e) {
        Logger.warn("[AuthProvider] Redis get creds failed", e);
      }
    }

    // 2. Try DB
    const cred = await whatsappCredentialRepository.findUnique(sessionId, key);

    if (!cred || !cred.value) return null;

    try {
      const rawJson = decrypt(cred.value, sessionId);
      if (!rawJson) {
        Logger.warn(`[AuthProvider] Decryption failed for ${sessionId}. Session data potentially corrupted or key changed.`);
        return null; 
      }

      const parsed = JSON.parse(rawJson, BufferJSON.reviver);

      // Backfill Cache
      if (redisClient?.isOpen) {
        redisClient.set(`${REDIS_PREFIX}${sessionId}:${key}`, cred.value, {
          EX: REDIS_TTL,
        });
      }

      return parsed;
    } catch (e) {
      Logger.error(`[AuthProvider] Failed to parse creds for ${sessionId}`, e);
      return null;
    }
  }

  public async saveCredentials(
    sessionId: string,
    creds: AuthenticationCreds,
  ): Promise<void> {
    return SessionQueue.enqueue(sessionId, async () => {
      const key = "creds";
      const json = JSON.stringify(creds, BufferJSON.replacer);
      const encrypted = encrypt(json, sessionId);

      const ops: Promise<unknown>[] = [];

      // Redis
      if (redisClient?.isOpen) {
        ops.push(
          redisClient
            .set(`${REDIS_PREFIX}${sessionId}:${key}`, encrypted, {
              EX: REDIS_TTL,
            })
            .catch((e) => Logger.warn("Redis save creds failed", e)),
        );
      }

      // DB
      ops.push(whatsappCredentialRepository.upsert(sessionId, key, encrypted));

      await Promise.all(ops);
    });
  }

  async clearCredentials(sessionId: string): Promise<void> {
    return SessionQueue.enqueue(sessionId, async () => {
      const ops: Promise<unknown>[] = [];

      if (redisClient?.isOpen) {
        // Pattern delete is expensive in Redis, but necessary for cleanup
        // Ideally we maintain a set of keys per session, but for now scan/keys is acceptable for infrequent deletion
        ops.push(
          (async () => {
            const keys = await redisClient.keys(`${REDIS_PREFIX}${sessionId}:*`);
            if (keys.length > 0) await redisClient.del(keys);
          })().catch((e) => Logger.warn("Redis clear failed", e)),
        );
      }

      ops.push(whatsappCredentialRepository.deleteMany(sessionId));

      await Promise.all(ops);
    });
  }
}
