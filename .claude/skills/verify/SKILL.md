---
description: Verify a change against this repo's real running local backend/frontend
---

# Verify — Sentry CRM

## Launch

```bash
docker compose up -d   # repo root: reply-postgres-local (5433), reply-redis-local (6379), reply-minio-local
cd backend && npm run dev    # nodemon, :4000 — GET /health for status (db/redis/memory)
cd frontend && npm run dev   # vite, :5173
```

Both backend/frontend are frequently **already running** from a prior session (long-lived nodemon/vite). Check before launching:

```bash
curl -s http://localhost:4000/health   # {"status":"healthy",...} or connection refused
curl -s -o /dev/null -w "%{http_code}" http://localhost:5173/
netstat -ano | grep ":4000" | grep LISTENING   # PID currently owning the port
```

If you `npm run dev` anyway and the port's taken, it fails fast with `EADDRINUSE`/`Port already in use` — that's fine, the existing instance is still good, just don't treat the failed launch as "backend is down."

## Auth for API-driven verification

```bash
TOKEN=$(curl -s -X POST http://localhost:4000/api/auth/login -H "Content-Type: application/json" \
  -d '{"email":"admin@sentrycrm.cloud","password":"g+qrN6Zh"}' | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
curl -s http://localhost:4000/api/tickets -H "Authorization: Bearer $TOKEN"
```

`companyId` for this login is `88888888-8888-8888-8888-888888888888` — the primary dev/demo tenant, matches production's seed company. Tickets only exist for conversations an agent has actually opened (`ensureActiveTicket` materializes them on-demand) — `GET /api/tickets` can legitimately return `total: 0` even with hundreds of conversations/messages in the DB. To materialize one for testing: `GET /api/tickets/:conversationId` (pass a **conversation** id as the ticket id param) — it creates the ticket if missing and returns it, same as opening a chat in the UI would.

## Driving the WhatsApp inbound pipeline without a live counterparty

You can't fake `remoteJidAlt`/`senderPn` (Baileys' LID-resolution hint fields) through a synthetic message — **they aren't in the `WAMessageKey` protobuf schema** (`node_modules/@whiskeysockets/baileys/WAProto/index.d.ts` has no such fields); Baileys attaches them out-of-band while parsing the raw XML stanza, so they get silently dropped by any `proto.WebMessageInfo.encode/decode` round-trip. Don't burn time trying — accept that on-resolution merge logic needs either a real linked phone or careful code review.

What DOES work: injecting a job directly into the real `whatsapp-inbound` BullMQ queue, which the already-running `InboundWorker` consumes exactly like a genuine Baileys event — this exercises the real orchestrator/DB writes, not a unit-test stub:

```js
const { proto } = require(".../backend/node_modules/@whiskeysockets/baileys");
const { Queue } = require(".../backend/node_modules/bullmq");
const encodedMessage = Buffer.from(
  proto.WebMessageInfo.encode(proto.WebMessageInfo.create({
    key: { remoteJid: "<jid>", fromMe: false, id: "<unique-id>" },
    messageTimestamp: Math.floor(Date.now()/1000),
    pushName: "Test",
    message: { conversation: "test" },
  })).finish()
).toString("base64");
await queue.add("process-message", { encodedMessage, sessionId: "<real active session id>", companyId: "88888888-..." }, { jobId: "<sessionId>_<messageId, sanitized>" });
```

Get the active `sessionId` from `GET /api/whatsapp/sessions` (needs a real linked session — status `CONNECTED`).

Inspect outcome directly in Postgres (`docker exec reply-postgres-local psql -U reply_user -d reply_db_local -c "..."`) rather than trusting queue state alone — check `job.getState()`/`job.failedReason`/`job.stacktrace` via a small script if a job fails, since dev-mode Winston doesn't write to `logs/*.log` (only console, and you often don't own the terminal the already-running server was launched from).

**Gotchas hit in the wild:**
- `nodemon` restart-on-save can lag noticeably (tens of seconds) — poll `GET /health`'s `uptime` field dropping to near-zero before trusting a restart happened, don't assume one save = one immediate restart.
- Writing to `C:\` root (e.g. a quick debug log) throws `EPERM` without admin rights — use a path inside the repo or scratchpad instead.
- Clean up test conversations before re-running: delete `tickets` → `messages` → `conversations` → `users` in that order (FK constraints), scoped by the test `channelId`/email prefix you used.