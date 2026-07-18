import { IAuthProvider } from "./interfaces";
import {
  AuthenticationState,
  BufferJSON,
  initAuthCreds,
  SignalDataTypeMap,
  AuthenticationCreds,
  SignalKeyStore,
} from "@whiskeysockets/baileys";
import { whatsappCredentialRepository } from "./WhatsAppCredentialRepository";
import redisClient from "../config/redis";
import { encrypt, decrypt } from "../utils/cryptoUtils";
import { Logger } from "../utils/logger";

const REDIS_PREFIX = "wa:sess:";
const REDIS_TTL = 60 * 60 * 24; // 24 hours

class SessionQueue {
  private static queues = new Map<string, Promise<unknown>>();

  static async enqueue<T>(sessionId: string, task: () => Promise<T>): Promise<T> {
    const previous = this.queues.get(sessionId) || Promise.resolve();
    const next = (async () => {
      try {
        await previous;
      } catch {
        // Safe fallback
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

    if (creds === null) {
      const exists = await whatsappCredentialRepository.findUnique(sessionId, "creds");
      if (exists) {
        throw new Error(
          `[AuthProvider] Decryption failed for session ${sessionId}. ` +
          `This is likely due to a mismatched SESSION_SECRET. Aborting initialization to protect credentials.`
        );
      }
    }

    const keys: SignalKeyStore = {
      get: async (type, ids) => {
        const data: { [id: string]: SignalDataTypeMap[typeof type] } = {};
        const fullKeys = ids.map((id) => `${type}-${id}`);
        const missingKeys: string[] = [];

        if (redisClient?.isOpen) {
          try {
            const redisKeys = fullKeys.map(
              (k) => `${REDIS_PREFIX}${sessionId}:${k}`,
            );
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
                  const decrypted = decrypt(val as string, sessionId);
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
            Logger.warn(err, "[AuthProvider] Redis MGET failed:");
            missingKeys.push(...fullKeys);
          }
        } else {
          missingKeys.push(...fullKeys);
        }

        if (missingKeys.length > 0) {
          const dbCredentials = await whatsappCredentialRepository.findMany(
            sessionId,
            missingKeys,
          );

          for (const cred of dbCredentials) {
            const id = cred.key.replace(`${type}-`, "");
            if (cred.value) {
              try {
                const decrypted = decrypt(cred.value, sessionId);
                
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

                if (redisClient?.isOpen && parsed !== null && parsed !== undefined) {
                  redisClient.set(
                    `${REDIS_PREFIX}${sessionId}:${cred.key}`,
                    cred.value,
                    { EX: REDIS_TTL },
                  ).catch((e) => Logger.warn(e, `[AuthProvider] Cache write-back skipped (${cred.key}):`));
                }
              } catch (e) {
                Logger.error(
                  e,
                  `[AuthProvider] DB Parse error for ${cred.key} in ${sessionId}:`
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

          if (redisClient?.isOpen) {
            if (redisDeletes.length > 0) {
              ops.push(
                redisClient.del(redisDeletes).catch((e) => Logger.warn(e, "Redis delete keys failed"))
              );
            }
            if (redisMulti) {
              ops.push(
                redisMulti.exec().catch((e) => Logger.warn(e, "Redis set failed")),
              );
            }
          }

          if (dbUpserts.length > 0) {
            ops.push(
              whatsappCredentialRepository
                .upsertMany(dbUpserts)
                .catch((e) =>
                  Logger.error(
                    e,
                    `[AuthProvider] DB Upsert failed for ${sessionId}`
                  ),
                ),
            );
          }

          if (dbDeletes.length > 0) {
            ops.push(
              whatsappCredentialRepository
                .deleteKeys(sessionId, dbDeletes)
                .catch((e) =>
                  Logger.error(
                    e,
                    `[AuthProvider] DB Delete failed for ${sessionId}`
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

    if (redisClient?.isOpen) {
      try {
        const cached = await Promise.race([
          redisClient.get(`${REDIS_PREFIX}${sessionId}:${key}`),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 2500)),
        ]);
        if (cached) {
          const decrypted = decrypt(cached as string, sessionId);
          if (decrypted) {
            return JSON.parse(decrypted, BufferJSON.reviver);
          }
        }
      } catch (e) {
        Logger.warn(e, "[AuthProvider] Redis get creds failed");
      }
    }

    const cred = await whatsappCredentialRepository.findUnique(sessionId, key);

    if (!cred || !cred.value) return null;

    try {
      const rawJson = decrypt(cred.value, sessionId);
      if (!rawJson) {
        Logger.warn(`[AuthProvider] Decryption failed for ${sessionId}.`);
        return null; 
      }

      const parsed = JSON.parse(rawJson, BufferJSON.reviver);

      if (redisClient?.isOpen) {
        redisClient.set(`${REDIS_PREFIX}${sessionId}:${key}`, cred.value, {
          EX: REDIS_TTL,
        });
      }

      return parsed;
    } catch (e) {
      Logger.error(e, `[AuthProvider] Failed to parse creds for ${sessionId}`);
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

      if (redisClient?.isOpen) {
        ops.push(
          redisClient
            .set(`${REDIS_PREFIX}${sessionId}:${key}`, encrypted, {
              EX: REDIS_TTL,
            })
            .catch((e) => Logger.warn(e, "Redis save creds failed")),
        );
      }

      ops.push(whatsappCredentialRepository.upsert(sessionId, key, encrypted));

      await Promise.all(ops);
    });
  }

  async clearCredentials(sessionId: string): Promise<void> {
    return SessionQueue.enqueue(sessionId, async () => {
      const ops: Promise<unknown>[] = [];

      if (redisClient?.isOpen) {
        ops.push(
          (async () => {
            const keys = await redisClient.keys(`${REDIS_PREFIX}${sessionId}:*`);
            if (keys.length > 0) await redisClient.del(keys);
          })().catch((e) => Logger.warn(e, "Redis clear failed")),
        );
      }

      ops.push(whatsappCredentialRepository.deleteMany(sessionId));

      await Promise.all(ops);
    });
  }
}
