import { createClient } from "redis";
import { Logger } from "@/utils/logger";

let redisClient: ReturnType<typeof createClient> | null = null;

const redisUrl = process.env.REDIS_URL;

if (redisUrl) {
  redisClient = createClient({
    url: redisUrl,
    pingInterval: 20000, // 20s Ping (Less aggressive)
    socket: {
      connectTimeout: 60000,
      tls: redisUrl.startsWith("rediss://"),
      rejectUnauthorized: false,
      keepAlive: 30000, // 30s KeepAlive (Standard)
      noDelay: true,
      reconnectStrategy: (retries) => {
        const delay = Math.min(retries * 100, 5000);
        // Logger.info(`[Redis] Reconnecting in ${delay}ms...`); // Reduce spam
        return delay;
      },
    },
    // Prevent crashing on command failure, just fail the command
    disableOfflineQueue: true, // [SEC] Don't queue commands if Redis is down
  });

  redisClient.on("error", (err) => {
    const msg = err.message || "";
    //  SILENCE DNS AND NETWORK NOISE
    const isNetworkError = [
      "ECONNRESET", "ETIMEDOUT", "Socket closed", "ENOTFOUND", 
      "ECONNABORTED", "ECONNREFUSED", "getaddrinfo", "Connection timeout", "EPIPE",
      "AggregateError"
    ].some(e => msg.includes(e));

    // Also catch AggregateError by constructor name (Node.js wraps multiple connection failures)
    if (isNetworkError || err.constructor?.name === "AggregateError") {
      // Logic: Only log network issues once to avoid spamming 1000 lines/sec
      return;
    }
    
    Logger.error("[Redis] Client Error", err);
  });

  redisClient.on("reconnecting", () => {
    // Silent reconnection
  });

  redisClient.on("ready", () => {
    Logger.info("[Redis] [OK] Connection fully ready");
  });
}

export const connectRedis = async () => {
  if (!redisClient) {
    Logger.warn(
      "[Redis] REDIS_URL not set. Running in Fallback Mode (Memory/File).",
    );
    return;
  }

  if (redisClient.isOpen) {
    return;
  }

  try {
    await redisClient.connect();
    Logger.info("[OK] Redis Client Connected");

    // Política: noeviction. Es la que EXIGE BullMQ (con cualquier otra emite
    // "IMPORTANT! Eviction policy ... should be noeviction" y no garantiza no
    // perder jobs) y es la que realmente usa Redis en Render. Antes forzábamos
    // volatile-lru, que en Render no aplicaba (NOPERM) pero en local rompía la
    // paridad y molestaba a BullMQ. El control de OOM se hace con TTLs en las
    // llaves de caché/wa:store + el MemoryMonitor, no con eviction.
    redisClient.sendCommand(["CONFIG", "SET", "maxmemory-policy", "noeviction"])
      .then(() => Logger.info("[Redis] [OK] maxmemory-policy set to noeviction"))
      .catch((e) => Logger.warn("[Redis] Could not set maxmemory-policy (configure manually in redis.conf):", e));

    // One-time cleanup: delete old wa:store:* keys that were written WITHOUT a
    // TTL (before this fix). They can accumulate to 50MB+ per session and are
    // the primary cause of Redis OOM. Sessions will rebuild their in-memory
    // store from WhatsApp sync; getMessage falls back to PostgreSQL.
    (async () => {
      try {
        let cursor = 0;
        let cleaned = 0;
        do {
          const result = await redisClient!.scan(cursor, { MATCH: "wa:store:*", COUNT: 100 });
          cursor = result.cursor;
          for (const key of result.keys) {
            const ttl = await redisClient!.ttl(key);
            if (ttl === -1) { // -1 = no TTL → old key, safe to delete
              await redisClient!.del(key);
              cleaned++;
            }
          }
        } while (cursor !== 0);
        if (cleaned > 0) {
          Logger.info(`[Redis] [CLEANUP] Deleted ${cleaned} TTL-less wa:store:* keys (freed ~${cleaned * 10}MB+)`);
        }
      } catch (e) {
        Logger.warn("[Redis] Store key cleanup failed:", e);
      }
    })();

    // Iniciar Monitoreo de Memoria
    startMemoryMonitor();
  } catch {
    Logger.warn("[Redis] Failed to connect. Will run in Memory/File Mode.");
    // We intentionally catch this so we don't crash the server startup
    // The app should be able to run without Redis (using in-memory fallbacks)
  }
};

/**
 * [SEC] Deletes the stalest `wa:store:*` keys (lowest remaining TTL — these get
 * their TTL refreshed on every write by an active session's persistence
 * interval, so a low remaining TTL means the session stopped writing a while
 * ago, i.e. disconnected/abandoned). Safe to delete: readFromRedis() already
 * handles a missing key by starting with an empty store. Bounded per call so
 * a single pass can't itself become a long-running scan under pressure.
 */
const purgeStaleWaStoreKeys = async (maxToDelete: number): Promise<number> => {
  if (!redisClient?.isOpen) return 0;

  const candidates: { key: string; ttl: number }[] = [];
  let cursor = 0;
  do {
    const result = await redisClient.scan(cursor, { MATCH: "wa:store:*", COUNT: 200 });
    cursor = result.cursor;
    for (const key of result.keys) {
      const ttl = await redisClient.ttl(key);
      if (ttl >= 0) candidates.push({ key, ttl });
    }
  } while (cursor !== 0 && candidates.length < maxToDelete * 4);

  candidates.sort((a, b) => a.ttl - b.ttl);
  const toDelete = candidates.slice(0, maxToDelete);
  for (const { key } of toDelete) {
    await redisClient.del(key);
  }
  return toDelete.length;
};

/**
 * [SEC] REDIS MEMORY MONITOR
 * Verifica la salud y capacidad de Redis periódicamente para evitar Out Of Memory (OOM).
 * `noeviction` es la política correcta para no perder jobs de BullMQ, pero eso significa
 * que Redis NUNCA libera espacio solo — sin esta purga activa, cruzar el límite deja TODO
 * comando de escritura (incluyendo los scripts Lua de BullMQ) fallando con OOM hasta que
 * alguien libere memoria a mano. Antes esta función solo logueaba el problema.
 */
const startMemoryMonitor = () => {
  const CHECK_INTERVAL_MS = 5 * 60 * 1000; // Revisar cada 5 minutos

  setInterval(async () => {
    if (!redisClient || !redisClient.isOpen) return;

    try {
      const info = await redisClient.info("memory");

      const extractValue = (key: string) => {
        const match = info.match(new RegExp(`${key}:(\\d+)`));
        return match ? parseInt(match[1], 10) : null;
      };

      const usedMemory = extractValue("used_memory");
      const maxMemory = extractValue("maxmemory");

      if (usedMemory !== null && maxMemory !== null && maxMemory > 0) {
        const usagePercentage = (usedMemory / maxMemory) * 100;

        if (usagePercentage >= 80) {
          Logger.error(`[CRITICAL] REDIS MEMORY LIMIT REACHED! Usando ${usagePercentage.toFixed(2)}% de la capacidad máxima. Purgando wa:store:* más viejos...`);
          try {
            const purged = await purgeStaleWaStoreKeys(100);
            Logger.warn(`[Redis] [PURGE] Deleted ${purged} stale wa:store:* keys to relieve memory pressure.`);
          } catch (purgeErr) {
            Logger.error("[Redis] Emergency purge failed:", purgeErr);
          }
        } else if (usagePercentage >= 70) {
          Logger.warn(`[WARNING] Redis Memory Warning. Usando ${usagePercentage.toFixed(2)}% de la capacidad.`);
        }
      }
    } catch (error) {
      Logger.warn("[Redis] Memory Check Failed", error);
    }
  }, CHECK_INTERVAL_MS);
};

export default redisClient;
