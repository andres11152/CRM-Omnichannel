import { Worker, Job } from "bullmq";
import { proto } from "@whiskeysockets/baileys";
import { chatSyncService } from "../ChatSyncService";
import { Logger } from "@/utils/logger";
import { contextStorage } from "@/context/requestContext";
import redisClient from "@/config/redis";

export class HistorySyncWorker {
  private worker: Worker;

  constructor() {
    if (!redisClient) {
      throw new Error("[HistorySyncWorker] Redis client not initialized");
    }

    const isTls = process.env.REDIS_URL?.startsWith("rediss://") ?? false;

    // Use a duplicate of the redis client configuration
    const redisOptions = {
      connection: {
        host: process.env.REDIS_HOST || "localhost",
        port: Number(process.env.REDIS_PORT) || 6379,
        password: process.env.REDIS_PASSWORD || undefined,
        tls: isTls ? { rejectUnauthorized: false } : undefined,
      }
    };

    this.worker = new Worker(
      "whatsapp-history-sync",
      async (job: Job) => {
        const { companyId, messages, chats, contacts, syncType } = job.data;
        
        Logger.info(`[HistorySyncWorker] Processing history sync job ${job.id} for company ${companyId}`);

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
              { onDemand }
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
        connection: redisClient as unknown as import("ioredis").Redis,
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
