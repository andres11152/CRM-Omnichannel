/**
 * BULL BOARD — Queue Dashboard
 *
 * Mounts a real-time UI to inspect BullMQ queues (whatsapp-inbound and
 * whatsapp-outbound). Protected by the existing superAdmin guard.
 *
 * Access: GET /api/admin/queues/
 */

import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { ExpressAdapter } from "@bull-board/express";
import { getWhatsAppQueue } from "@/whatsapp/queue/WhatsAppQueue";
import { Logger } from "@/utils/logger";

const BASE_PATH = "/api/admin/queues";

let serverAdapter: ExpressAdapter | null = null;

export function createQueueDashboardRouter() {
  if (serverAdapter) return serverAdapter.getRouter();

  try {
    const qm = getWhatsAppQueue();

    serverAdapter = new ExpressAdapter();
    serverAdapter.setBasePath(BASE_PATH);

    createBullBoard({
      queues: [
        new BullMQAdapter(qm.inboundQueue, { readOnlyMode: false }),
        new BullMQAdapter(qm.outboundQueue, { readOnlyMode: false }),
      ],
      serverAdapter,
    });

    Logger.info(`[QueueDashboard] Bull Board mounted at ${BASE_PATH}`);
  } catch (err) {
    Logger.error("[QueueDashboard] Failed to initialize Bull Board:", err);
    // Return empty router so the app still starts
    const { Router } = require("express");
    const r = Router();
    r.use((_req: unknown, res: { status: (n: number) => { json: (o: unknown) => void } }) =>
      res.status(503).json({ error: "Queue dashboard unavailable" }),
    );
    return r;
  }

  return serverAdapter.getRouter();
}
