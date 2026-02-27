import {
  AuthenticationState,
  AuthenticationCreds,
  SignalDataTypeMap,
  initAuthCreds,
  BufferJSON,
} from "@whiskeysockets/baileys";
import redisClient from "../config/redis";
import { Logger } from "@/utils/logger";

/**
 * Custom Auth Adapter for Baileys using Redis.
 * Stores all auth data in a Redis HASH for a given sessionId.
 * Key: `wa:auth:${sessionId}`
 * Fields:
 *   - "creds": JSON string of AuthenticationCreds
 *   - "type:id": JSON string of signal keys (mimicking file structure)
 */
export const useRedisAuthState = async (
  sessionId: string,
): Promise<{ state: AuthenticationState; saveCreds: () => Promise<void> }> => {
  // Check if Redis is actually usable
  const isRedisReady = redisClient && redisClient.isOpen;

  if (!isRedisReady) {
    // FALLBACK: File System Auth
    const { useMultiFileAuthState } = await import("@whiskeysockets/baileys");
    const path = await import("path");

    const sessionDir = path.join(process.cwd(), "sessions", sessionId);
    // Logger.debug(`[Auth] Using File System for session ${sessionId} at ${sessionDir}`);

    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
    return { state, saveCreds };
  }

  // REDIS IMPLEMENTATION (Safe)
  const REDIS_KEY = `wa:auth:${sessionId}`;

  // 1. Helper to read JSON from Redis
  const readData = async (field: string) => {
    try {
      const data = await redisClient?.hGet(REDIS_KEY, field);
      if (data) {
        return JSON.parse(data, BufferJSON.reviver);
      }
      return null;
    } catch (error) {
      // CRITICAL: Propagate error on infrastructure failure
      // If we return null here, Baileys will create a NEW session, overwriting the old one!
      Logger.error(
        `[RedisAuth] 💥 CRITICAL REDIS ERROR reading ${field}:`,
        error as Error,
      );
      throw error;
    }
  };

  // 2. Helper to write JSON to Redis
  const writeData = async (data: Record<string, unknown>) => {
    if (!redisClient?.isOpen) return;

    try {
      const entries: string[] = [];
      for (const [key, value] of Object.entries(data)) {
        if (value === null || value === undefined) {
          await redisClient.hDel(REDIS_KEY, key);
        } else {
          entries.push(key);
          entries.push(JSON.stringify(value, BufferJSON.replacer));
        }
      }

      if (entries.length > 0) {
        await redisClient.hSet(REDIS_KEY, entries);
      }
    } catch (err) {
      Logger.warn("[RedisAuth] Failed to write data (non-critical):", err);
    }
  };

  // 4. Initialize Creds
  const creds: AuthenticationCreds =
    (await readData("creds")) || initAuthCreds();

  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const data: { [id: string]: SignalDataTypeMap[typeof type] } = {};
          await Promise.all(
            ids.map(async (id) => {
              const value = await readData(`${type}:${id}`);
              if (type === "app-state-sync-key" && value && value.keyData) {
                // BufferJSON.reviver should have already converted this to Buffer
                // But just in case it didn't (legacy data), check before wrapping
                if (!Buffer.isBuffer(value.keyData)) {
                  value.keyData = Buffer.from(value.keyData, "base64");
                }
              }
              if (value) {
                data[id] = value;
              }
            }),
          );
          return data;
        },

        set: async (data: Record<string, Record<string, unknown>>) => {
          const tasks: Record<string, unknown> = {};
          for (const category in data) {
            for (const id in data[category]) {
              const value = data[category][id];
              const key = `${category}:${id}`;
              tasks[key] = value;
            }
          }
          await writeData(tasks);
        },
      },
    },
    saveCreds: async () => {
      await writeData({ creds: creds });
    },
  };
};
