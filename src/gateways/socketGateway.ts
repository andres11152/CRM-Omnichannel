import { Server, Socket } from "socket.io";
import { Logger } from "@/utils/logger";

/**
 * SOCKET GATEWAY SINGLETON (Clustered)
 * This class manages the Real-Time connection layer.
 * 🛡️ SENIOR FIX: Running in MEMORY MODE to ensure reliable connectivity in local dev.
 */
class WebSocketGateway {
  private io: Server | null = null;

  /**
   * Initialize the Socket.io Server
   */
  public async initialize(httpServer: any) {
    Logger.info("[Gateway] Initializing Socket.io (Memory Mode)");

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
    });

    Logger.info("[Gateway] WebSocket Server Initialized (Memory Mode)");
    this.handleConnections();
  }

  private handleConnections() {
    if (!this.io) return;

    this.io.on("connection", (socket: Socket) => {
      const agentId = socket.handshake.query.agentId as string;

      if (agentId) {
        Logger.info(`[Gateway] Agent connected: ${agentId}`);
        socket.join(`agent:${agentId}`);

        socket.on("agent_status_change", (status: string) => {
          Logger.info(`[Gateway] Agent ${agentId} is now ${status}`);
        });

        // Allow subscribing to rooms (Companies, Conversations)
        socket.on("join", (room: string) => {
          if (room) {
            socket.join(room);
          }
        });

        socket.on("disconnect", () => {
          Logger.info(`[Gateway] Agent disconnected: ${agentId}`);
        });
      } else {
        // Anonymous connection (logging but allowing)
        Logger.warn(`[Gateway] Anonymous connection: ${socket.id}`);
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
    return false; // Valid in Memory Mode
  }
}

export const gateway = new WebSocketGateway();
