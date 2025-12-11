import { Server, Socket } from "socket.io";
import { Logger } from "@/utils/logger";

/**
 * SOCKET GATEWAY SINGLETON (Clustered)
 * This class manages the Real-Time connection layer.
 * 🛡️ PRODUCTION READY: Auto-detects Redis for scaling, falls back to Memory for local dev.
 */
class WebSocketGateway {
  private io: Server | null = null;
  private redisPubClient: any = null;
  private redisSubClient: any = null;
  private isRedisActive: boolean = false;

  /**
   * Initialize the Socket.io Server
   */
  public async initialize(httpServer: any) {
    Logger.info("[Gateway] Initializing Socket.io...");

    let adapter: any = undefined;

    // 1. Setup Redis Adapter if REDIS_URL is present
    if (process.env.REDIS_URL) {
      try {
        Logger.info("[Gateway] REDIS_URL detected, attempting connection...");
        const { createClient } = await import("redis");
        const { createAdapter } = await import("@socket.io/redis-adapter");

        const pubClient = createClient({ url: process.env.REDIS_URL });
        const subClient = pubClient.duplicate();

        pubClient.on("error", (err) =>
          Logger.error("[Gateway] Redis Pub Error:", err)
        );
        subClient.on("error", (err) =>
          Logger.error("[Gateway] Redis Sub Error:", err)
        );

        await Promise.all([pubClient.connect(), subClient.connect()]);

        this.redisPubClient = pubClient;
        this.redisSubClient = subClient;
        this.isRedisActive = true;

        adapter = createAdapter(pubClient, subClient);
        Logger.info(
          "[Gateway] ✅ Redis Adapter Configured & Connected (Production Mode)"
        );
      } catch (error) {
        Logger.error(
          "[Gateway] ❌ Failed to connect to Redis. Falling back to Memory Mode.",
          error
        );
        this.isRedisActive = false;
        // Proceed without adapter (Memory Mode)
      }
    } else {
      Logger.warn(
        "[Gateway] REDIS_URL not found. Running in Memory Mode (Local Dev)."
      );
    }

    // 2. Create IO Server
    this.io = new Server(httpServer, {
      cors: {
        origin: [
          "http://localhost:5173",
          "http://localhost:5174",
          "http://localhost:3000",
          "https://reply.software",
          "https://www.reply.software",
        ],
        methods: ["GET", "POST"],
        credentials: true,
      },
      transports: ["polling", "websocket"],
      pingTimeout: 20000,
      pingInterval: 25000,
      adapter: adapter, // Will be undefined in Memory Mode (default)
    });

    Logger.info(
      `[Gateway] WebSocket Server Initialized (${
        this.isRedisActive ? "REDIS" : "MEMORY"
      } Mode)`
    );
    this.handleConnections();
  }

  private handleConnections() {
    if (!this.io) return;

    this.io.on("connection", (socket: Socket) => {
      const agentId = socket.handshake.query.agentId as string;

      if (agentId) {
        // Logger.info(`[Gateway] Agent connected: ${agentId}`); // Reduce noise
        socket.join(`agent:${agentId}`);

        socket.on("agent_status_change", (status: string) => {
          Logger.info(`[Gateway] Agent ${agentId} is now ${status}`);
        });

        // Allow subscribing to rooms (Companies, Conversations)
        socket.on("join", (room: string) => {
          if (room) {
            socket.join(room);
            Logger.info(`[Gateway] Socket ${socket.id} joined room: ${room}`);
          }
        });

        // ✅ Handle join_room event for conversation-specific rooms
        socket.on("join_room", (data: { conversationId: string }) => {
          if (data.conversationId) {
            socket.join(data.conversationId);
            Logger.info(
              `[Gateway] 🚪 Socket ${socket.id} joined conversation: ${data.conversationId}`
            );
          }
        });

        socket.on("disconnect", () => {
          // Logger.info(`[Gateway] Agent disconnected: ${agentId}`);
        });
      } else {
        // Anonymous connection (logging but allowing)
        // Logger.warn(`[Gateway] Anonymous connection: ${socket.id}`);
        socket.on("disconnect", () => {
          // Silent disconnect
        });
      }
    });
  }

  public getIO() {
    return this.io;
  }

  public isRedisConnected(): boolean {
    return this.isRedisActive;
  }
}

export const gateway = new WebSocketGateway();
