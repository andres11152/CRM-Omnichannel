# CRM Omnichannel SaaS - Enterprise Technical Documentation

This repository houses a multi-tenant Omnichannel CRM backend and frontend built for high performance, modularity, and strict architectural isolation.

---

## 1. Architectural Commandments

### Layered Isolation (R-S-C Pattern)
The codebase strictly follows the Repository-Service-Controller (R-S-C) pattern:
- **Repositories (`src/repositories/`)**: The only layer allowed to import and interact with the database client (Prisma). Direct Prisma calls are forbidden in services and controllers.
- **Services (`src/services/`)**: Implements pure business logic, orchestration, and external API integrations.
- **Controllers (`src/controllers/`)**: Manages HTTP request parsing, validation, and response status codes.

### Strict Multi-Tenant Isolation
All database queries, socket emissions, and message streams MUST be scoped by `companyId`. This scopes operations to the specific tenant and prevents cross-tenant data leaks.

### Strict Typing & Code Standards
- Zero use of `any`.
- Inbound payloads and WhatsApp events must be validated using Zod schemas.
- Centralized logger (Winston/Pino) must capture stack traces and context (e.g., `SessionId`, `CompanyId`) inside catch blocks.

### Single Responsibility Principle (SRP)
To prevent the creation of "God Classes," no source file may exceed 500 lines of code. Modular delegation and stateless helpers must be used to fragment complex services.

---

## 2. Core Modules & Recent Architectural Enhancements

### A. Real-time Event System (Socket.IO Broadcasts)
The socket emission framework has been decomposed to prevent `SocketEventEmitter` from exceeding the SRP limit. It utilizes the delegation pattern:
- `SocketEventEmitter` (`src/services/SocketEventEmitter.ts`): Re-exports types (`ConversationWithRelations`, `MessageWithSender`, `ISocketGateway`) and orchestrates delegators, maintaining 100% backward compatibility.
- `ConversationSocketEmitter` (`src/services/ConversationSocketEmitter.ts`): Dedicated to conversation lifecycle actions (creation, updates, assignments, closed states, typing triggers, warnings, and ticket events).
- `MessageSocketEmitter` (`src/services/MessageSocketEmitter.ts`): Dedicated to message actions (reception, transmission status, revocation/deletion, pinning, and reaction updates).
- `SocketEventFormatter` (`src/services/SocketEventFormatter.ts`): Contains clean mapping helpers (`formatConversation`, `formatMessage`) to format payloads consistently and prevent circular import dependencies.

### B. Outbound WhatsApp Message Processing
The outbound message handlers have been split to isolate payload assembly and post-send updates:
- `OutboundMessageHandler` (`src/whatsapp/providers/handlers/OutboundMessageHandler.ts`): Manages the main orchestration for text/media transmission, presence notifications, and emoji reactions.
- `OutboundMessageHelper` (`src/whatsapp/providers/handlers/OutboundMessageHelper.ts`): Executes ancillary routines:
  - Conversation ID mapping (supporting ticket sync fallbacks).
  - Quoted message resolution (translating UUIDs to WhatsApp IDs with safe group participant validation).
  - Group metadata pre-fetching to prevent silent drops after server reboots.
  - Post-send operations (database updates/upserts, AI human-in-the-loop auto-mute tracking, and socket notifications).

### C. WhatsApp Chat Synchronization
The main synchronization module has been decomposed into three decoupled layers:
- `ChatSyncIngest` (`src/services/sync/ChatSyncIngest.ts`): Handles synchronization queues, history requests, and concurrency locks.
- `ChatSyncJidResolver` (`src/services/sync/ChatSyncJidResolver.ts`): Translates LIDs/JIDs, accesses Baileys store caches, and orders history chunks.
- `ChatSyncBatchIngester` (`src/services/sync/ChatSyncBatchIngester.ts`): Executes batch database insertions for contacts, messages, and reaction logs.

### D. WhatsApp Session & Socket Factory
The lifecycle of Baileys socket creation has been decoupled from the session state manager:
- `WhatsAppSocketFactory` (`src/whatsapp/providers/WhatsAppSocketFactory.ts`): Instantiates the Baileys socket, managing proxy agent configurations, fake client headers, and timeout-protected WhatsApp version fetching.
- `SessionManager` (`src/whatsapp/providers/SessionManager.ts`): Reduced below 500 lines, delegating socket instantiation to the factory.

---

## 3. Security & Infrastructure Middleware

### Redis-Backed CSRF Protection
CSRF tokens are stored statelessly in Redis with a 1-hour TTL, securing session requests. An automated in-memory fallback map takes over if the Redis connection is dropped.

### Custom CORS Configuration
The security middleware whitelists custom headers (`X-Api-Key`, `X-Request-Id`, `X-Company-Id`) to allow secure cross-origin HTTP requests.

### Redis Memory Protection
A memory monitor actively tracks memory limits. Since BullMQ requires a `noeviction` policy, all temporary caching keys (e.g., Baileys credentials, CSRF sessions) are enforced with strict TTLs (up to 7 days).

---

## 4. Development & Verification

### Local Setup
Ensure a local Redis instance and PostgreSQL instance are running, then configure `.env`:
```bash
# Backend directory
cd backend
npm install
npm run dev

# Frontend directory
cd ../frontend
npm install
npm run dev
```

### Static Analysis & Type Checking
To verify type safety and ensure no compilation regressions, run:
```bash
npx tsc --noEmit
```
All modifications are verified to build cleanly without warnings.
