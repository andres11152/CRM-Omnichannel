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

export class DatabaseAuthProvider implements IAuthProvider {
  async loadState(sessionId: string): Promise<{
    state: AuthenticationState;
    saveCreds: () => Promise<void>;
  }> {
    const creds = await this.loadCreds(sessionId);

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
            const cachedValues = await redisClient.mGet(redisKeys);

            cachedValues.forEach((val, i) => {
              if (val) {
                const id = ids[i];
                try {
                  // Cached value is Encrypted -> Decrypt -> Parse
                  const decrypted = decrypt(val);
                  if (decrypted) {
                    data[id] = JSON.parse(decrypted, BufferJSON.reviver);
                  }
                } catch {
                  Logger.warn(
                    `[AuthProvider] Cache parse error for ${fullKeys[i]}`,
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
                // Fallback: If decrypt returns null (legacy data), try parsing raw
                let rawJson = decrypt(cred.value);
                if (!rawJson) {
                  // Try legacy raw JSON (migration path)
                  rawJson = cred.value;
                }

                const parsed = JSON.parse(rawJson, BufferJSON.reviver);
                data[id] = parsed;

                // 3. Populate Cache (Read-Through)
                if (redisClient?.isOpen) {
                  await redisClient.set(
                    `${REDIS_PREFIX}${sessionId}:${cred.key}`,
                    cred.value, // Cache encrypted value directly
                    { EX: REDIS_TTL },
                  );
                }
              } catch (e) {
                Logger.error(
                  `[AuthProvider] DB Parse error for ${cred.key}:`,
                  e,
                );
              }
            }
          }
        }

        return data;
      },

      set: async (data) => {
        const ops: Promise<unknown>[] = [];
        const redisMulti = redisClient?.isOpen ? redisClient.multi() : null;
        const dbData: { sessionId: string; key: string; value: string }[] = [];

        for (const category of Object.keys(data)) {
          for (const id of Object.keys(data[category])) {
            const value = data[category][id];
            const key = `${category}-${id}`;
            const json = JSON.stringify(value, BufferJSON.replacer);
            const encrypted = encrypt(json);

            // Prepare DB Upsert Data
            dbData.push({ sessionId, key, value: encrypted });

            if (redisMulti) {
              redisMulti.set(`${REDIS_PREFIX}${sessionId}:${key}`, encrypted, {
                EX: REDIS_TTL,
              });
            }
          }
        }

        // Execute Redis Pipeline
        if (redisMulti) {
          ops.push(
            redisMulti.exec().catch((e) => Logger.warn("Redis set failed", e)),
          );
        }

        // Execute DB Transaction
        ops.push(
          whatsappCredentialRepository
            .upsertMany(dbData)
            .catch((e) =>
              Logger.error(
                `[AuthProvider] DB Transaction failed for ${sessionId}`,
                e,
              ),
            ),
        );

        await Promise.all(ops);
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
        const cached = await redisClient.get(
          `${REDIS_PREFIX}${sessionId}:${key}`,
        );
        if (cached) {
          const decrypted = decrypt(cached);
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
      let rawJson = decrypt(cred.value);
      if (!rawJson) rawJson = cred.value; // Legacy fallback

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
    const key = "creds";
    const json = JSON.stringify(creds, BufferJSON.replacer);
    const encrypted = encrypt(json);

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
  }

  async clearCredentials(sessionId: string): Promise<void> {
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
  }
}
