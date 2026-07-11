# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Multi-tenant Omnichannel CRM SaaS (Sentry CRM). Node/TypeScript backend (Express), React/Vite frontend, Prisma/PostgreSQL, Redis, Socket.IO, Baileys for WhatsApp connectivity. `backend/` and `frontend/` are independent npm projects (no root package.json / workspace tooling — run commands from inside each directory).

## Commands

### Local setup
Requires local PostgreSQL + Redis (a `docker-compose.yml` at the repo root provisions `reply-postgres-local` (Postgres 18, port 5433), `reply-redis-local` (Redis 7.2.4), and MinIO for local S3-compatible media storage — mirrors the Render production stack). `backend/.env` should point at these local services, never at the Render production DB/Redis directly (linking a local session to the same WhatsApp session as production causes a `conflict: replaced` socket kick).

```bash
docker compose up -d          # from repo root: postgres, redis, minio

cd backend && npm install && npm run dev     # nodemon, http://localhost:4000
cd frontend && npm install && npm run dev    # vite, http://localhost:5173
```

### Backend (`backend/`)
```bash
npm run dev              # nodemon dev server
npm run build            # rimraf dist && tsc
npm start                # runs compiled dist/server.js (production)
npm run start:worker     # runs dist/worker.js — see "Worker split" below
npx tsc --noEmit          # type-check only, no emit — run this after any change
npm run lint              # eslint src/**
npm test                  # jest (tests live in backend/test/, not colocated with src/)
npx jest test/RolesService.test.ts        # run a single test file
npx jest -t "some test name"              # run tests matching a name
npm run prisma:generate   # regenerate Prisma Client after schema.prisma changes
npm run prisma:dev        # create + apply a new migration locally (interactive)
npm run prisma:deploy     # apply pending migrations non-interactively (what Render's build runs)
npm run prisma:studio
```

### Frontend (`frontend/`)
```bash
npm run dev       # vite dev server
npm run build      # tsc && vite build
npx tsc --noEmit -p tsconfig.json   # type-check only
```

### Deploy
Render (`render.yaml`), single web service, `autoDeploy: true` on push to `main`. Build command is `npm install && npx prisma migrate deploy && npm run build` — **a `schema.prisma` change with no corresponding migration file is a silent no-op in this step and will 500 every query touching the changed model in production** (seen twice: missing `meeting_types`/`availabilities` tables, missing `outlookCalendarToken` columns). Always run `npm run prisma:dev` (or generate the migration via `prisma migrate diff` against a shadow DB if `migrate dev` can't run interactively) and commit the resulting `prisma/migrations/*` folder in the same change as the schema edit.

## Architecture

### Repository-Service-Controller, strictly
`backend/src/repositories/` is the only layer allowed to touch Prisma directly. `services/` holds business logic and orchestration; `controllers/` only parses/validates HTTP and shapes the response. Files are kept under ~500 lines by delegating to focused sub-services rather than growing "god classes" — e.g. `ChatSyncService` (public API) delegates to `sync/ChatSyncIngest.ts` (queues/history requests), `sync/ChatSyncJidResolver.ts` (LID/JID + store access), `sync/ChatSyncBatchIngester.ts` (batch DB writes). `SocketEventEmitter` similarly delegates to `ConversationSocketEmitter`/`MessageSocketEmitter`/`SocketEventFormatter`. When a service file is getting large, look for this pattern before adding more inline logic.

### Multi-tenant isolation is enforced by a Prisma extension, not by convention
`backend/src/config/database.ts` wraps every Prisma call in a `$extends` `$allOperations` hook that reads `companyId` from an `AsyncLocalStorage` context (`backend/src/context/requestContext.ts`, adapted via `backend/src/config/tenantContext.ts` / `TenantContextManager`) and auto-injects/enforces it on every query. Any model not in the `GLOBAL_MODELS` allowlist (Company, Plan, Role, Permission, WhatsAppCredential, Stage, PropertyImage) throws `SECURITY VIOLATION` if called with no context — this is intentional, not a bug to work around by adding models to the allowlist.
- `protect` middleware (`middleware/authMiddleware.ts`) establishes context for normal HTTP requests by wrapping `next()` in `TenantContextManager.run(...)`.
- Background workers / queue consumers must manually wrap their handler in `TenantContextManager.run(...)` or `runWithCompanyId(...)` — there is no middleware for them.
- Routes that are legitimately public (webhooks, public booking pages, OAuth callbacks) must wrap their DB access in `TenantContextManager.runAsSystem(...)`, matching queries already scoped by an explicit `companyId` in the `where` clause. Forgetting this is the single most common cause of a public endpoint 500ing in production.
- `SOFT_DELETE_MODELS` (Contact, Deal, Ticket, Campaign) get `delete`/`deleteMany` silently rewritten to `update`/`updateMany` with `deletedAt`, and reads exclude soft-deleted rows unless `includeDeleted: true` is passed in the query args.

### Two separate queue systems coexist — know which one you're touching
- **BullMQ** (`bullmq` package), single global queues `whatsapp-inbound` / `whatsapp-outbound` (`whatsapp/queue/WhatsAppQueue.ts`, consumed by `whatsapp/queue/workers/InboundWorker.ts` / `OutboundWorker.ts`): the live Baileys message pipeline. Inbound concurrency is tunable (`WA_INBOUND_CONCURRENCY`); outbound is fixed at `concurrency: 1` because a company's messages must dispatch through one WhatsApp socket in send order.
- **Bull** (`bull` package, legacy), one queue *per company* (`whatsapp-messages:${companyId}`, `services/queue/messageQueueService.ts` + `messageQueueWorker.ts`): the manual/CRM-triggered agent send path, also fixed at `concurrency: 1` per company for the same FIFO reason. Idle company queues are evicted after 30 minutes to bound Redis connections — `messageQueueService.enqueue()` calls `ensureWorkerForCompany()` before every add specifically so a worker always exists for a freshly (re)created queue; don't remove that call.

### WhatsApp session lifecycle and identity resolution
Baileys sockets are managed inside the API process itself (`server.ts` → `WhatsAppService.initialize()`), not in a separate worker — `worker.ts` exists as a dormant PM2-oriented entry point but WhatsApp session management is NOT currently split out to it (`WORKER_MODE=false` is the only supported mode today). A deploy therefore briefly restarts the live WhatsApp connection; messages sent during that gap are not lost (BullMQ jobs persist in Redis independent of the process, and WhatsApp's own multi-device protocol redelivers messages to a reconnecting device), but expect a `conflict: replaced` log during Render's zero-downtime overlap window.

Inbound message resolution has real complexity around WhatsApp's LID (Linked ID) addressing: `InboundOrchestratorService.resolveEntities()` (delegating to `IdentityResolverService` / `SessionContactResolver`) is the **actual, live** entity-resolution path for the WhatsApp pipeline — there is a separate, more feature-complete `MessageProcessorService` → `ConversationResolver` pipeline in the codebase (used by the Instagram webhook path) with better LID-conversation-merge handling, but it is **not** what processes live WhatsApp messages. Don't assume LID-merge safety nets from one pipeline apply to the other.

### Memory is a hard constraint, not headroom
`utils/resourceManager.ts`'s `MemoryMonitor` compares RSS against the actual container cgroup limit (not `--max-old-space-size`, which can be — and has been — configured far larger than the container's real RAM) and force-flushes Baileys' in-memory message/chat stores plus a manual GC when RSS crosses 90% of the container limit. `SimpleInMemoryStore.flush()` preserves LID→phone mappings and contact records across a flush; only `messages`/`chats` are cleared. When investigating memory pressure, check the RSS-vs-heap split in the monitor's log line first — a low heap% with high RSS% points at native/Buffer allocations (media downloads, S3 uploads), not a JS object leak, and calls for a different fix than a heap issue would.

### Frontend
`frontend/src/hooks/useAgentWorkspace.ts` is the central hook backing the main agent inbox (tickets list, active ticket/contact derivation, optimistic updates); `useAgentWorkspaceSockets.ts` handles the corresponding real-time socket event merging into that same ticket state. i18n is `react-i18next` with two flat JSON dictionaries (`frontend/src/i18n/locales/{es,en}.json`) — always add a key to both files together, namespaced by feature (e.g. `chat.*`, `activities_page.*`), and never leave literal Spanish/English strings hardcoded in a component that has a language toggle elsewhere in the app. State is a mix of Zustand stores (`stores/`), React Query for server cache, and plain hook state for view-local UI.

## Conventions (from `RULES.md` / `.agent/AI_PERSONALITY.md`)
- No `any` — use specific types or `unknown` with narrowing/Zod validation.
- No emoji in logs, code comments, or committed docs. Use bracket text markers instead: `[OK]`, `[ERROR]`, `[WARNING]`, `[SEC]`, `[DB]`, `[SYNC]`, `[WS]`, `[PERF]`.
- Every inbound HTTP/socket payload and every raw Baileys event is validated with Zod before use (see `whatsapp/core/validation/baileys.schemas.ts` for the Baileys-event pattern).
- Frontend: `lucide-react` icons only, no raw emoji in UI copy.
