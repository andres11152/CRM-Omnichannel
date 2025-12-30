// BACKEND CODE
// Install: npm install @socket.io/redis-emitter redis

import { Emitter } from "@socket.io/redis-emitter";
import { createClient } from "redis";
import { Logger } from "../utils/logger";

let emitter: Emitter | null = null;

/**
 * SOCKET EMITTER SERVICE
 *
 * Use this service in BullMQ Workers, Cron Jobs, or Serverless Functions
 * where you don't have access to the main `io` server object but need
 * to send messages to connected clients.
 */

const initializeEmitter = () => {
  if (emitter) return emitter;

  if (!process.env.REDIS_URL) {
    Logger.warn("[SocketEmitter] REDIS_URL not found. Emitter disabled.");
    return null;
  }

  const redisClient = createClient({
    url: process.env.REDIS_URL,
    socket: {
      family: 4,
      tls: process.env.REDIS_URL?.startsWith("rediss://"),
      rejectUnauthorized: false,
    },
  });

  redisClient.on("error", (err) => {
    // 🤫 SILENCE KNOWN NETWORK NOISE
    const msg = err.message || "";
    if (
      msg.includes("ECONNRESET") ||
      msg.includes("ETIMEDOUT") ||
      msg.includes("Socket closed") ||
      msg.includes("Connection timeout") ||
      msg.includes("ENOTFOUND") ||
      msg.includes("getaddrinfo")
    ) {
      return;
    }
    Logger.error("Redis Emitter Client Error", err);
  });

  redisClient
    .connect()
    .catch((err) => Logger.error("Redis Emitter Connection Error", err));

  emitter = new Emitter(redisClient);
  Logger.info("[SocketEmitter] 📡 Emitter Service Ready");
  return emitter;
};

export const SocketEmitter = {
  /**
   * Send a message to a specific Agent Room via Redis
   */
  toAgent: (agentId: string, event: string, data: any) => {
    const io = emitter || initializeEmitter();
    if (io) {
      io.to(`agent:${agentId}`).emit(event, data);
    }
  },

  /**
   * Broadcast to all users
   */
  broadcast: (event: string, data: any) => {
    const io = emitter || initializeEmitter();
    if (io) {
      io.emit(event, data);
    }
  },
};
