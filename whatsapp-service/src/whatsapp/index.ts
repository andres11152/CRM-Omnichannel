import { DatabaseAuthProvider } from "./AuthProvider";
import { SessionManager } from "./SessionManager";

const authProvider = new DatabaseAuthProvider();
export const sessionManager = new SessionManager(authProvider);

export { SessionManager } from "./SessionManager";
export { DatabaseAuthProvider } from "./AuthProvider";
export * from "./types";
export * from "./interfaces";
export { EventBus } from "./events/EventBus";
export { WhatsAppEventType, WhatsAppEvent } from "./events/WhatsAppEvents";
