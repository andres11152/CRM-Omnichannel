import { WASocket, Contact } from "@whiskeysockets/baileys";
import { SessionConfig, SessionStatus } from "../types/whatsapp.types";

export interface ISessionManager {
  initializeSession(config: SessionConfig): Promise<WASocket>;
  getSession(sessionId: string): WASocket | undefined;
  getSessionStatus(sessionId: string): SessionStatus;
  terminateSession(sessionId: string, clearAuth?: boolean): Promise<void>;
  listSessions(companyId: string): SessionStatus[];
  reconnectSession(sessionId: string): Promise<void>;

  //  Memory-First Optimizations (Bulk Messaging Performance)
  findActiveSessionForCompany(
    companyId: string,
  ): Promise<{ sessionId: string; socket: WASocket } | null>;
  hasActiveSessionInMemory(companyId: string): boolean;

  // [SEC] User Identity Resolution (LID -> Phone)
  findContactByLid(sessionId: string, lid: string): Contact | undefined;
  getContactInfo(sessionId: string, jid: string): Contact | undefined;

  // [SEC] Active LID Resolution (Queries WhatsApp servers directly)
  resolveLidToPhone(sessionId: string, lid: string): Promise<string | null>;
  resolveLidsToPhones(sessionId: string, lids: string[]): Promise<Record<string, string>>;
  
  // [SEC] Data Access without ORM Leakage
  getSessionInfo(sessionId: string): Promise<{
    companyId: string;
    status: SessionStatus["status"];
    phone?: string | null;
  } | null>;

  // ️ Store Access
  getSessionStore(sessionId: string): {
    chats: Map<string, import("@whiskeysockets/baileys").Chat>;
    messages: Record<string, import("@whiskeysockets/baileys").proto.IWebMessageInfo[]>;
    contacts: Record<string, Contact>;
    lidToPhone: Record<string, string>;
  } | null;

  // [SEC] MEMORY MANAGEMENT
  flushAllMemoryStores(): void;
  getAllMemorySessions(): Record<string, string>;
}
