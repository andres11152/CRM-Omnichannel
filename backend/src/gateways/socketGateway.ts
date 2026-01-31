import { Server } from "socket.io";
import { Server as HttpServer } from "http";
import { createClient } from "redis";
import { createAdapter } from "@socket.io/redis-adapter";
import jwt, { JwtPayload } from "jsonwebtoken";
import { Logger } from "@/utils/logger";

/**
 * STRICT TYPES DEFINITIONS
 */
interface TokenPayload extends JwtPayload {
  id: string;
  role: string;
  companyId?: string; // JWT usually drops nulls, so optional string is better
}

interface SocketData {
  user: {
    id: string;
    role: string;
    companyId: string | null;
  };
}

// Importing service for session tracking
import { agentSessionService } from "@/services/agentSessionService";

// Enforcing strict event signatures.
// Ideally, all events should be named here.
interface ServerToClientEvents {
  [event: string]: (...args: unknown[]) => void;
}

interface ClientToServerEvents {
  join: (room: string) => void;
  join_room: (data: { conversationId: string }) => void;
  "conversation:typing": (data: { to: string; status: string }) => void;
}

interface InterServerEvents {
  ping: () => void; // Keep-alive internal event example, or empty
}

/**
 * SOCKET GATEWAY SINGLETON
 * Supports Redis Adapter for production scaling.
 * Implements strict Authentication & JWT Validation.
 */
class WebSocketGateway {
  private io: Server<
    ClientToServerEvents,
    ServerToClientEvents,
    InterServerEvents,
    SocketData
  > | null = null;
  private redisConnected: boolean = false;

  public async initialize(httpServer: HttpServer) {
    Logger.info("[Gateway] 🔧 Initializing Socket.io...");

    this.io = new Server(httpServer, {
      cors: {
        origin: [
          process.env.FRONTEND_URL || "http://localhost:5173",
          "http://localhost:5174",
          "https://reply.software",
          "https://www.reply.software",
          "https://crm-omnichannel.onrender.com",
        ],
        methods: ["GET", "POST"],
        credentials: true,
      },
      transports: ["polling", "websocket"],
      pingTimeout: 20000,
      pingInterval: 25000,
    });

    await this.setupRedis();
    this.setupMiddleware();
    this.handleConnections();

    Logger.info("[Gateway] ✅ WebSocket fully initialized");
  }

  private async setupRedis() {
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) {
      Logger.warn("[Gateway] ⚠️ No REDIS_URL found. Using Memory Adapter.");
      return;
    }

    Logger.info(`[Gateway] 🔌 Connecting to Redis...`);
    try {
      const pubClient = createClient({
        url: redisUrl,
        pingInterval: 10000,
        socket: {
          connectTimeout: 60000,
          keepAlive: 60000,
          noDelay: true,
          reconnectStrategy: (retries: number) => Math.min(retries * 100, 3000),
          tls: redisUrl.startsWith("rediss://"),
          rejectUnauthorized: false,
        },
      });
      const subClient = pubClient.duplicate();

      const errorHandler = (err: unknown) => {
        let msg = "Unknown Redis Error";
        if (err instanceof Error) {
          msg = err.message;
        } else if (typeof err === "string") {
          msg = err;
        }

        // Filter known fleeting errors
        if (
          msg.includes("ECONNRESET") ||
          msg.includes("ETIMEDOUT") ||
          msg.includes("Socket closed")
        ) {
          return;
        }
        Logger.error(`[Gateway] Redis Error: ${msg}`);
      };

      pubClient.on("error", errorHandler);
      subClient.on("error", errorHandler);

      await Promise.all([pubClient.connect(), subClient.connect()]);

      if (this.io) {
        this.io.adapter(createAdapter(pubClient, subClient));
        this.redisConnected = true;
        Logger.info("[Gateway] ✅ Redis Adapter Configured Successfully");
      }
    } catch (err) {
      Logger.error(
        "[Gateway] ❌ Redis Connection Failed. Using Memory Adapter.",
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  private setupMiddleware() {
    if (!this.io) return;

    // 🛡️ AUTHENTICATION MIDDLEWARE
    this.io.use((socket, next) => {
      const token =
        socket.handshake.auth?.token || socket.handshake.query?.token;

      if (!token || Array.isArray(token)) {
        return next(new Error("Authentication error: No token provided"));
      }

      try {
        const secret = process.env.JWT_SECRET;
        if (!secret) throw new Error("JWT_SECRET missing");

        // Strict Typing for JWT verification
        const decoded = jwt.verify(token as string, secret) as TokenPayload;

        // Populate socket data with strict types
        socket.data.user = {
          id: decoded.id,
          role: decoded.role || "USER",
          companyId: decoded.companyId || null,
        };

        Logger.debug(
          `[Gateway] User ${decoded.id} authenticated (Company: ${decoded.companyId})`,
        );

        next();
      } catch {
        Logger.warn(`[Gateway] Auth failed for socket ${socket.id}`);
        next(new Error("Authentication error: Invalid token"));
      }
    });
  }

  private handleConnections() {
    if (!this.io) return;

    this.io.on("connection", (socket) => {
      const user = socket.data.user;

      if (!user) {
        socket.disconnect();
        return;
      }

      // Auto-join personal agent room
      const userRoom = `agent:${user.id}`;
      socket.join(userRoom);

      // 🛡️ 100-YEAR FIX: Strict Access Control for Agents via Socket Rooms
      // Agents should NOT receive all company traffic. They only care about their assigned work.
      // Admins and Supervisors need full visibility (Company Room).
      if (user.companyId) {
        if (["ADMIN", "SUPERVISOR", "MASTER"].includes(user.role)) {
          const companyRoom = `company:${user.companyId}`;
          socket.join(companyRoom);
          Logger.debug(
            `[Gateway] ${user.id} (${user.role}) joined company room: ${companyRoom}`,
          );
        } else {
          Logger.debug(
            `[Gateway] ${user.id} (${user.role}) restricted to personal room only`,
          );
        }
      }

      // 🟢 CONNECTION EVENT
      // 1. Update DB/Redis with status 'online' & 'lastSeen'
      this.updateUserStatus(user.id, "online");

      // 1.5 Start Analytics Session
      if (user.companyId) {
        agentSessionService.startSession({
          userId: user.id,
          companyId: user.companyId,
          socketId: socket.id,
        });
      }

      Logger.debug(
        `[Gateway] Client connected: ${user.id} (Role: ${user.role})`,
      );

      // EMIT STATUS ONLINE
      if (user.companyId) {
        this.emitToCompany(user.companyId, "agent:status", {
          id: user.id,
          status: "online",
          lastSeen: new Date().toISOString(),
        });
      }

      socket.on("join", (room: string) => {
        if (room) {
          socket.join(room);
          Logger.debug(`[Gateway] ${user.id} joined room: ${room}`);
        }
      });

      socket.on("join_room", (data) => {
        if (data?.conversationId) {
          socket.join(data.conversationId);
          Logger.debug(
            `[Gateway] ${user.id} joined conv: ${data.conversationId}`,
          );
        }
      });

      socket.on("disconnect", async (reason) => {
        Logger.debug(`[Gateway] Client disconnected: ${user.id} (${reason})`);

        // 🔴 DISCONNECT EVENT
        // Update DB/Redis with status 'offline' & 'lastSeen'
        await this.updateUserStatus(user.id, "offline");

        // End Analytics Session
        await agentSessionService.endSession({ socketId: socket.id });

        // EMIT STATUS OFFLINE
        if (user.companyId) {
          this.emitToCompany(user.companyId, "agent:status", {
            id: user.id,
            status: "offline",
            lastSeen: new Date().toISOString(),
          });
        }
      });
    });
  }

  // Helper method to update Prisma + Redis (if needed)
  private async updateUserStatus(userId: string, status: "online" | "offline") {
    try {
      // We use dynamic import for prisma to avoid circular dep issues in singleton if any
      const { prisma } = await import("@/config/database");
      await prisma.user.update({
        where: { id: userId },
        data: {
          // We might need to add 'status' field to User model if not present, but for now we track lastSeen.
          // Actually, the UI relies on 'lastSeen'.
          lastSeen: new Date(),
          isOnline: status === "online",
        },
      });
    } catch (err) {
      Logger.error(`[Gateway] Failed to update user status for ${userId}`, err);
    }
  }

  public getIO() {
    return this.io;
  }

  // Safe emit method using Generics if possible, or unknown
  public emitToCompany(companyId: string, event: string, data: unknown): void {
    if (!this.io) {
      Logger.warn("[Gateway] Cannot emit: Socket.io not initialized");
      return;
    }
    const room = `company:${companyId}`;
    this.io.to(room).emit(event, data);
  }

  public emitToUser(userId: string, event: string, data: unknown): void {
    if (!this.io) return;
    const room = `agent:${userId}`;
    this.io.to(room).emit(event, data);
  }

  public isRedisConnected(): boolean {
    return this.redisConnected;
  }
}

export const gateway = new WebSocketGateway();
