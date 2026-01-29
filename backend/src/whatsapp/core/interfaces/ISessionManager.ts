import { WASocket } from "@whiskeysockets/baileys";
import { SessionConfig, SessionStatus } from "../types/whatsapp.types";

export interface ISessionManager {
  initializeSession(config: SessionConfig): Promise<WASocket>;
  getSession(sessionId: string): WASocket | undefined;
  getSessionStatus(sessionId: string): SessionStatus;
  terminateSession(sessionId: string): Promise<void>;
  listSessions(companyId: string): SessionStatus[];
  reconnectSession(sessionId: string): Promise<void>;

  // 🚀 Memory-First Optimizations (Bulk Messaging Performance)
  findActiveSessionForCompany(
    companyId: string,
  ): Promise<{ sessionId: string; socket: WASocket } | null>;
  hasActiveSessionInMemory(companyId: string): boolean;
}
