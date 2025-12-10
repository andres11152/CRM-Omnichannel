// BACKEND CODE (Node.js / NestJS compatible)
// Install: npm install socket.io @socket.io/redis-adapter redis

import { Server, Socket } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { createClient } from "redis";
import type { Message } from "@prisma/client"; // Usar el tipo de Prisma
import { Logger } from "@/utils/logger"; // Usar alias de ruta

/**
 * SOCKET GATEWAY SINGLETON (Clustered)
 * This class manages the Real-Time connection layer.
 * It uses Redis Pub/Sub to sync events across multiple backend instances.
 */
class WebSocketGateway {
  private io: Server | null = null;
  private pubClient: any = null;

  /**
   * Initialize the Socket.io Server with Redis Adapter
   */
  public async initialize(httpServer: any) {
    let adapterConfig = {};

    // Debug: Log REDIS_URL status
    console.log(`[Gateway] REDIS_URL configured: ${!!process.env.REDIS_URL}`);
    if (process.env.REDIS_URL) {
      console.log(
        `[Gateway] REDIS_URL value: ${process.env.REDIS_URL.substring(
          0,
          20
        )}...`
      );
    }

    // Only connect to Redis if URL is provided (Production Mode)
    if (process.env.REDIS_URL) {
      try {
        this.pubClient = createClient({ url: process.env.REDIS_URL });
        const subClient = this.pubClient.duplicate();

        // Prevent "missing 'error' handler" crash
        this.pubClient.on("error", (err: any) =>
          Logger.error("Redis Pub Client Error", err)
        );
        subClient.on("error", (err: any) =>
          Logger.error("Redis Sub Client Error", err)
        );

        await Promise.all([this.pubClient.connect(), subClient.connect()]);

        adapterConfig = {
          adapter: createAdapter(this.pubClient, subClient),
        };

        console.log(
          "[Gateway] 🚀 Redis Adapter connected for Horizontal Scaling"
        );
      } catch (error) {
        console.error(
          "[Gateway] ⚠️ Redis Connection Failed. Falling back to Memory Adapter.",
          error
        );
      }
    } else {
      console.warn("[Gateway] ⚠️ No REDIS_URL found. Using Memory Adapter.");
    }

    this.io = new Server(httpServer, {
      ...adapterConfig,
      cors: {
        origin: true, // Allow any origin in development/production for now to fix connection issues
        methods: ["GET", "POST"],
        credentials: true,
      },
      // Transports: Start with polling, upgrade to websocket (Standard reliability)
      transports: ["polling", "websocket"],
    });

    Logger.info("[Gateway] WebSocket Server Initialized");
    this.handleConnections();
  }

  private handleConnections() {
    if (!this.io) return;

    this.io.on("connection", (socket: Socket) => {
      const agentId = socket.handshake.query.agentId as string;

      console.log(
        `[Gateway] New connection attempt. AgentID: ${
          agentId || "MISSING"
        }, Socket: ${socket.id}`
      );

      if (agentId) {
        Logger.info(
          `[Gateway] Agent connected: ${agentId} (Socket: ${
            socket.id
          } | Node: ${process.env.NODE_APP_INSTANCE || "Master"})`
        );
        socket.join(`agent:${agentId}`);

        socket.on("agent_status_change", (status) => {
          Logger.info(`[Gateway] Agent ${agentId} is now ${status}`);
        });

        socket.on("disconnect", () => {
          Logger.info(`[Gateway] Agent disconnected: ${agentId}`);
        });
      } else {
        // Allow connection but warn - useful for debugging
        Logger.warn(
          `[Gateway] Connection allowed without Agent ID (Socket: ${socket.id})`
        );

        socket.on("disconnect", () => {
          Logger.info(`[Gateway] Anonymous socket disconnected: ${socket.id}`);
        });

        // Don't disconnect automatically to allow debugging
        // socket.disconnect();
      }
    });
  }

  public getIO() {
    return this.io;
  }

  public isRedisConnected(): boolean {
    return !!this.pubClient && this.pubClient.isOpen;
  }
}

export const gateway = new WebSocketGateway();
