import { AuthenticationState, AuthenticationCreds, WASocket, Contact } from "@whiskeysockets/baileys";
import { SessionConfig, SessionStatus } from "./types";

export interface IAuthProvider {
  loadState(
    sessionId: string,
  ): Promise<{ state: AuthenticationState; saveCreds: () => Promise<void> }>;
  saveCredentials(sessionId: string, creds: AuthenticationCreds): Promise<void>;
  clearCredentials(sessionId: string): Promise<void>;
}

export interface ISessionManager {
  initializeSession(config: SessionConfig): Promise<WASocket>;
  getSession(sessionId: string): WASocket | undefined;
  getSessionStatus(sessionId: string): SessionStatus;
  terminateSession(sessionId: string, clearAuth?: boolean): Promise<void>;
  listSessions(companyId: string): Promise<SessionStatus[]>;
  reconnectSession(sessionId: string): Promise<void>;

  findActiveSessionForCompany(
    companyId: string,
  ): Promise<{ sessionId: string; socket: WASocket } | null>;
  hasActiveSessionInMemory(companyId: string): boolean;

  findContactByLid(sessionId: string, lid: string): Contact | undefined;
  getContactInfo(sessionId: string, jid: string): Contact | undefined;

  resolveLidToPhone(sessionId: string, lid: string): Promise<string | null>;
  resolveLidsToPhones(sessionId: string, lids: string[]): Promise<Record<string, string>>;
  
  getSessionInfo(sessionId: string): Promise<{
    companyId: string;
    status: SessionStatus["status"];
    phone?: string | null;
  } | null>;

  getSessionStore(sessionId: string): {
    chats: Map<string, import("@whiskeysockets/baileys").Chat>;
    messages: Record<string, import("@whiskeysockets/baileys").proto.IWebMessageInfo[]>;
    contacts: Record<string, Contact>;
    lidToPhone: Record<string, string>;
  } | null;

  flushAllMemoryStores(): void;
  getAllMemorySessions(): Record<string, string>;
}
