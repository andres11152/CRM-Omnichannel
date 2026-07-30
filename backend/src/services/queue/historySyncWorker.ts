import { Worker, Job } from "bullmq";
import { proto } from "@whiskeysockets/baileys";
import { chatSyncService } from "../ChatSyncService";
import { Logger } from "@/utils/logger";
import { contextStorage } from "@/context/requestContext";
import { connection } from "@/config/bullmq";

export class HistorySyncWorker {
  private worker: Worker;

  constructor() {
    this.worker = new Worker(
      "whatsapp-history-sync",
      async (job: Job) => {
        const { companyId, messages, chats, contacts, syncType, peerDataRequestSessionId, lidPnMappings } = job.data;

        Logger.info(
          `[HistorySyncWorker] Processing history sync job ${job.id} for company ${companyId}` +
            (peerDataRequestSessionId ? ` (peerDataRequestSessionId: ${peerDataRequestSessionId})` : ""),
        );

        // [DOCS · Baileys] proto.HistorySync.HistorySyncType: INITIAL_BOOTSTRAP=0,
        // INITIAL_STATUS_V3=1, FULL=2, RECENT=3, PUSH_NAME=4, NON_BLOCKING_DATA=5,
        // ON_DEMAND=6. This previously hardcoded `=== 2`, which is actually FULL —
        // every on-demand (manual "sync history") batch was misclassified as a bulk
        // sync: it never emitted `conversation:history_synced`, so the frontend never
        // refetched even after messages landed in the DB. Use the real enum so this
        // can't silently drift again.
        const onDemand = syncType === proto.HistorySync.HistorySyncType.ON_DEMAND;

        await contextStorage.run({ companyId, requestId: `history-sync:${job.id}` }, async () => {
          try {
            await chatSyncService.handleHistorySync(
              companyId,
              messages || [],
              chats || [],
              contacts || [],
              { onDemand },
              lidPnMappings || [],
            );
            Logger.info(`[HistorySyncWorker] Ingested history sync job ${job.id} successfully`);
          } catch (err: unknown) {
            const errMsg = err instanceof Error ? err.message : String(err);
            Logger.error(`[HistorySyncWorker] Job ${job.id} failed: ${errMsg}`);
            throw err;
          }
        });
      },
      {
        // [ENTERPRISE · CRITICAL] Was `redisClient` from "@/config/redis" — the
        // `redis` npm package's client, not ioredis. BullMQ duck-types its
        // connection option (checking for connect/disconnect/duplicate) and
        // the `redis` client happens to pass that check, so no error was ever
        // thrown; but its actual read loop needs ioredis-only APIs
        // (`defineCommand` for Lua scripts, `.status` state machine), so the
        // worker silently never consumed a single job — every on-demand sync
        // request landed in Redis and stayed in "waiting" forever. Confirmed
        // empirically: a job enqueued via a real ioredis-backed Queue never
        // left "waiting" state with a Worker built on the `redis` client, with
        // zero error/failed events fired. Use the shared ioredis connection,
        // same as the (working) messageQueueWorker.
        connection,
        concurrency: 1, // Keep it sequential to avoid locking issues on messages
      }
    );

    this.worker.on("ready", () => {
      Logger.info("[HistorySyncWorker] Ready and listening for history sync jobs");
    });
  }

  async shutdown(): Promise<void> {
    await this.worker.close();
  }
}
