# WhatsApp Module - Event-Driven Architecture

## Overview

Production-grade WhatsApp integration with:

- **Event-Driven Architecture** for decoupled components
- **Dependency Injection** for testability
- **SOLID Principles** throughout
- **Auto-Reconnection** and resilience
- **Rate Limiting** to prevent WhatsApp bans

## Architecture

```
whatsapp/
├── core/
│   ├── interfaces/          # Contracts (Dependency Inversion)
│   ├── events/              # Event Bus + Event Types
│   └── types/               # Domain Types
├── providers/               # Implementations
│   ├── SessionManager.ts    # Session lifecycle
│   ├── MessageHandler.ts    # Message processing
│   └── AuthProvider.ts      # Database-backed auth
├── services/
│   └── RateLimitService.ts  # Rate limiting
├── WhatsAppService.ts       # Orchestrator (Facade)
└── index.ts                 # Public API
```

## Key Principles

### 1. Single Responsibility (SRP)

- `SessionManager`: Session lifecycle ONLY
- `MessageHandler`: Message processing ONLY
- `AuthProvider`: Authentication state ONLY
- `RateLimitService`: Rate limiting ONLY

### 2. Event-Driven

- Components communicate via `EventBus`
- No direct dependencies between handlers
- Easy to add new listeners without modifying code

### 3. Dependency Injection

- All dependencies injected via constructors
- Easy to mock for testing
- Follows SOLID principles

## Quick Start

### Basic Usage

```typescript
import { whatsappService } from "@/whatsapp";

// Initialize (call once at startup)
await whatsappService.initialize();

// Create session
const { sessionId, qrCode } = await whatsappService.createSession("company-id");

// Send message
await whatsappService.sendMessage("+1234567890", "Hello World", {
  companyId: "company-id",
  conversationId: "conv-id",
  senderId: "user-id",
});

// List sessions
const sessions = await whatsappService.listSessions("company-id");

// Delete session
await whatsappService.deleteSession("session-id");
```

### Event Subscriptions

```typescript
import { EventBus, WhatsAppEventType } from "@/whatsapp";

const eventBus = EventBus.getInstance();

// Listen to all events
eventBus.subscribe("*", (event) => {
  console.log(`Event: ${event.type}`, event.data);
});

// Listen to specific events
eventBus.subscribe(WhatsAppEventType.MESSAGE_RECEIVED, async (event) => {
  console.log("New message:", event.data.message);
  // Trigger AI, notifications, etc.
});

eventBus.subscribe(WhatsAppEventType.SESSION_DISCONNECTED, async (event) => {
  console.log(`Session ${event.sessionId} disconnected`);
  // Alert admins
});

eventBus.subscribe(WhatsAppEventType.RATE_LIMIT_EXCEEDED, async (event) => {
  console.log(`Rate limit exceeded: ${event.sessionId}`);
  // Pause sending
});
```

## Event Types

```typescript
enum WhatsAppEventType {
  SESSION_CONNECTED = "session.connected",
  SESSION_DISCONNECTED = "session.disconnected",
  SESSION_QR_CODE = "session.qr_code",
  SESSION_ERROR = "session.error",
  MESSAGE_RECEIVED = "message.received",
  MESSAGE_SENT = "message.sent",
  MESSAGE_FAILED = "message.failed",
  CONTACT_UPDATED = "contact.updated",
  RATE_LIMIT_EXCEEDED = "rate_limit.exceeded",
}
```

## Migration from Legacy

### Before (God Object - 2500 lines)

```typescript
import { whatsappService } from "@/services/whatsapp.service";
```

### After (Event-Driven - 7 focused modules)

```typescript
import { whatsappService } from "@/whatsapp";
```

**API is 100% backward compatible!** No breaking changes.

## Components

### WhatsAppService (Orchestrator)

Singleton facade that coordinates all components.

```typescript
class WhatsAppService {
  initialize(): Promise<void>
  createSession(companyId: string, sessionId?: string): Promise<{...}>
  deleteSession(sessionId: string): Promise<void>
  listSessions(companyId: string): SessionStatus[]
  getSession(sessionId: string): SessionStatus
  sendMessage(to: string, content: string, options: SendMessageOptions): Promise<MessagePayload>
}
```

### SessionManager

Manages session lifecycle with auto-reconnection.

```typescript
interface ISessionManager {
  initializeSession(config: SessionConfig): Promise<WASocket>;
  getSession(sessionId: string): WASocket | undefined;
  getSessionStatus(sessionId: string): SessionStatus;
  terminateSession(sessionId: string): Promise<void>;
  reconnectSession(sessionId: string): Promise<void>;
}
```

### MessageHandler

Processes incoming/outgoing messages.

```typescript
interface IMessageHandler {
  handleIncoming(message: any, sessionId: string): Promise<void>;
  sendMessage(
    to: string,
    content: string,
    options: SendMessageOptions,
  ): Promise<MessagePayload>;
  sendMedia(
    to: string,
    media: any,
    options: SendMessageOptions,
  ): Promise<MessagePayload>;
  markAsRead(messageId: string, sessionId: string): Promise<void>;
}
```

### AuthProvider

Database-backed Baileys authentication.

```typescript
interface IAuthProvider {
  loadState(
    sessionId: string,
  ): Promise<{ state: AuthenticationState; saveCreds: () => Promise<void> }>;
  saveCredentials(sessionId: string, creds: AuthenticationCreds): Promise<void>;
  clearCredentials(sessionId: string): Promise<void>;
}
```

### RateLimitService

Prevents WhatsApp bans with configurable limits.

```typescript
class RateLimitService {
  checkLimit(sessionId: string): Promise<boolean>;
  enforceLimit(sessionId: string): Promise<void>;
  getStats(sessionId: string): {
    count: number;
    limit: number;
    resetAt: Date | null;
  };
}
```

## Configuration

Environment variables:

```env
WA_RATE_LIMIT_MAX_MESSAGES=100
WA_RATE_LIMIT_WINDOW_SECONDS=3600
```

## Testing

All components are testable via dependency injection:

```typescript
// Mock SessionManager
const mockSessionManager: ISessionManager = {
  initializeSession: jest.fn(),
  getSession: jest.fn(),
  // ...
};

// Inject into MessageHandler
const handler = new MessageHandler(mockSessionManager);
```

## Benefits

1. **Maintainability:** 7 focused modules vs 1 God Object
2. **Testability:** All dependencies injected
3. **Extensibility:** Add features via events
4. **Scalability:** Event-driven = horizontal scaling
5. **Resilience:** Auto-reconnection, rate limiting

## Troubleshooting

**Issue:** Session won't connect

- **Fix:** Check database credentials table exists
- **Debug:** Look for `[SessionManager]` logs

**Issue:** Messages not sending

- **Fix:** Verify session status is `CONNECTED`
- **Debug:** Check rate limit with `rateLimitService.getStats()`

**Issue:** Memory leaks

- **Fix:** Ensure event listeners are cleaned up
- **Debug:** Use `eventBus.listenerCount()`

---

**Built with SOLID. Tested with DI. Scaled with Events.**
