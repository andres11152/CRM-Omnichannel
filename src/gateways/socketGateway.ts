import { Server, Socket } from "socket.io";
import { createClient } from "redis";
import { createAdapter } from "@socket.io/redis-adapter";

/**
 * SOCKET GATEWAY SINGLETON
 * Supports Redis Adapter for production scalability
 */
class WebSocketGateway {
  private io: Server | null = null;
  private redisConnected: boolean = false;

  public async initialize(httpServer: any) {
    console.log("[Gateway] 🔧 Initializing Socket.io...");

    this.io = new Server(httpServer, {
      cors: {
        origin: [
          "http://localhost:5173",
          "http://localhost:5174",
          "https://reply.software",
          "https://www.reply.software",
          "https://crm-omnichannel.onrender.com",
          process.env.FRONTEND_URL || "http://localhost:5173",
        ],
        methods: ["GET", "POST"],
        credentials: true,
      },
      transports: ["polling", "websocket"],
      pingTimeout: 20000,
      pingInterval: 25000,
    });

    // REDIS ADAPTER LOGIC
    const redisUrl = process.env.REDIS_URL;
    if (redisUrl) {
      console.log(`[Gateway] 🔌 Connecting to Redis at ${redisUrl}...`);
      try {
        const pubClient = createClient({
          url: redisUrl,
          pingInterval: 10000, // 💓 Keep connection alive
          socket: {
            connectTimeout: 50000,
            tls: redisUrl.startsWith("rediss://"),
            rejectUnauthorized: false,
          },
        });
        const subClient = pubClient.duplicate();

        // 🛡️ CRITICAL: Prevent crash on Redis errors & Silence Noise
        // 🛡️ CRITICAL: Prevent crash on Redis errors & Silence Noise
        const errorHandler = (err: any) => {
          const msg = err.message || "";
          if (
            msg.includes("ECONNRESET") ||
            msg.includes("ETIMEDOUT") ||
            msg.includes("Socket closed") ||
            msg.includes("ENOTFOUND") ||
            msg.includes("ECONNABORTED") ||
            msg.includes("getaddrinfo") ||
            msg.includes("Connection timeout")
          ) {
            return; // 🤫 Shh... it's just the internet blinking.
          }
          console.error("[Gateway] Redis Error:", msg);
        };
        pubClient.on("error", errorHandler);
        subClient.on("error", errorHandler);

        await Promise.all([pubClient.connect(), subClient.connect()]);

        this.io.adapter(createAdapter(pubClient, subClient));
        this.redisConnected = true;
        console.log("[Gateway] ✅ Redis Adapter Configured Successfully");
      } catch (err) {
        console.error(
          "[Gateway] ❌ Redis Connection Failed. Using Memory Adapter.",
          err
        );
      }
    } else {
      console.log("[Gateway] ⚠️ No REDIS_URL found. Using Memory Adapter.");
    }

    this.handleConnections();
    console.log("[Gateway] ✅ WebSocket fully initialized");
  }

  private handleConnections() {
    if (!this.io) return;

    this.io.on("connection", (socket: Socket) => {
      const agentId = socket.handshake.query.agentId as string;
      socket.join(`agent:${agentId || "anonymous"}`);

      socket.on("join", (room: string) => {
        if (room) socket.join(room);
      });

      socket.on("join_room", (data: { conversationId: string }) => {
        if (data.conversationId) {
          socket.join(data.conversationId);
          console.log(
            `[Gateway] 🔌 Client joined room: ${data.conversationId}`
          );
        }
      });

      socket.on("disconnect", () => {});
    });
  }

  public getIO() {
    return this.io;
  }

  public isRedisConnected(): boolean {
    return this.redisConnected;
  }
}

export const gateway = new WebSocketGateway();
