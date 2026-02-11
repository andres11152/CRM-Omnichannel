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
  "session.check_status": () => void | Promise<void>;
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
        origin: (origin, callback) => {
          // Allow requests with no origin (mobile apps, Postman)
          if (!origin) return callback(null, true);

          const allowedOrigins = [
            process.env.FRONTEND_URL || "http://localhost:5173",
          ];

          if (process.env.ALLOWED_ORIGINS) {
            allowedOrigins.push(
              ...process.env.ALLOWED_ORIGINS.split(",").map((o) =>
                o.trim().replace(/\/$/, ""),
              ),
            );
          }

          if (allowedOrigins.includes(origin)) return callback(null, true);

          // 🛡️ 100-YEAR FIX: Allow all subdomains (preview environments, staging)
          if (
            origin.endsWith(".reply.software") ||
            origin.endsWith(".onrender.com")
          ) {
            return callback(null, true);
          }

          if (process.env.NODE_ENV !== "production") {
            return callback(null, true);
          }

          callback(new Error(`CORS: Origin ${origin} not allowed`));
        },
        methods: ["GET", "POST"],
        credentials: true,
      },
      // 🛡️ 100-YEAR FIX: Prioritize WebSocket for lower latency, fallback to polling
      transports: ["websocket", "polling"],
      // Increase timeouts to reduce false disconnections
      pingTimeout: 30000, // 30s (was 20s)
      pingInterval: 25000, // 25s
      // Enable connection state recovery for seamless reconnections
      connectionStateRecovery: {
        maxDisconnectionDuration: 2 * 60 * 1000, // 2 minutes
        skipMiddlewares: true,
      },
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

      // 🛡️ SECURITY AUDIT FIX: SECURE ROOM JOINING
      // Prevents tenants from joining other tenants' rooms
      socket.on("join", (room: string) => {
        if (!room) return;

        // 1. Allow Generic Agent Room (Self)
        if (room === `agent:${user.id}`) {
          socket.join(room);
          return;
        }

        // 2. Strict Company Room Validation
        // If it looks like a company room "company:123"
        if (room.startsWith("company:")) {
          const expectedRoom = `company:${user.companyId}`;

          if (room !== expectedRoom) {
            Logger.warn(
              `[Gateway] 🚨 SECURITY ALERT: User ${user.id} (Company: ${user.companyId}) tried to join unauthorized room: ${room}`,
            );

            // 🛑 PENALTY: Disconnect suspicious client
            socket.emit("error", {
              message: "Unauthorized access detected. Reported.",
            });
            socket.disconnect(true);
            return;
          }

          // Authorize if role permits
          if (["ADMIN", "SUPERVISOR", "MASTER"].includes(user.role)) {
            socket.join(room);
            Logger.debug(`[Gateway] Authorized join to ${room}`);
          } else {
            Logger.warn(
              `[Gateway] 🚫 Role ${user.role} denied access to global company room`,
            );
          }
          return;
        }

        // 3. Conversation Rooms
        // "conversation:UUID" - Hard to enumerate, but ideally we should check ownership.
        // For now, we allow them assuming the frontend only requests what it sees.
        // FUTURE: Query Redis/DB to verify User belongs to Company of Conversation.
        if (room.startsWith("conversation:") || room.startsWith("ticket:")) {
          // Basic structure validation could go here
          socket.join(room);
          return;
        }

        // 4. Deny everything else by default
        Logger.warn(`[Gateway] Denied join to unknown room type: ${room}`);
      });

      socket.on("join_room", (data) => {
        if (data?.conversationId) {
          // Reuse logic or keep simple
          socket.join(data.conversationId);
          Logger.debug(
            `[Gateway] ${user.id} joined conv: ${data.conversationId}`,
          );
        }
      });

      // 🟢 TYPING INDICATOR (100-YEAR FIX)
      socket.on("conversation:typing", async (data) => {
        console.info(
          `[Gateway] 📥 Received typing event: ${JSON.stringify(data)} from ${user.id}`,
        );
        if (!user.companyId || !data.to || !data.status) return;

        // Sanitize status
        const status = data.status === "composing" ? "composing" : "paused";

        try {
          // Dynamic imports to avoid circular deps
          const { prisma } = await import("@/config/database");
          const { whatsappService } =
            await import("@/whatsapp/WhatsAppService");

          // Check if 'to' is a UUID (Conversation ID) or JID
          const isUuid =
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
              data.to,
            );

          let targetJid = data.to;

          if (isUuid) {
            // Resolve Conversation specific channel ID
            const conv = await prisma.conversation.findUnique({
              where: { id: data.to },
              select: { channelId: true },
            });
            if (conv?.channelId) {
              targetJid = conv.channelId;
            }
          }

          // Broadcast to WhatsApp
          // Signature: (to, type, companyId)
          await whatsappService.sendPresenceUpdate(
            targetJid,
            status,
            user.companyId,
          );

          // Also broadcast to other agents in the conversation room (for internal typing indicators)
          // Exclude sender
          socket.to(data.to).emit("conversation:typing", {
            from: user.id,
            conversationId: data.to,
            status,
          });
        } catch (err) {
          Logger.warn(`[Gateway] Failed to handle typing for ${user.id}`, err);
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

  public emitToRoom(room: string, event: string, data: unknown): void {
    if (!this.io) return;
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
