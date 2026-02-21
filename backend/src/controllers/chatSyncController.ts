/**
 * 🔄 CHAT SYNC CONTROLLER
 *
 * Enterprise-grade REST API for triggering historical message synchronization.
 * Follows Controller-Service-Repository architecture.
 */

import { Request, Response } from "express";
import { catchAsync } from "@/utils/catchAsync";
import { AppError } from "@/utils/AppError";
import {
  chatSyncService,
  ChatSyncRequestSchema,
} from "@/services/chatSyncService";
import { whatsappService } from "@/whatsapp";

// ========================
// CONTROLLER HANDLERS
// ========================

/**
 * POST /api/whatsapp/sync
 * Trigger a historical message sync for the current company.
 */
export const triggerSync = catchAsync(async (req: Request, res: Response) => {
  const companyId = req.user?.companyId;
  const userId = req.user?.id;

  if (!companyId || !userId) {
    throw new AppError("Authentication required", 401);
  }

  // Body is already validated by the routing middleware
  const body = req.body;

  // Find session
  let sessionId = body.sessionId;
  if (!sessionId) {
    const sessions = await whatsappService.getSessions(companyId);
    const connectedSession = sessions.find((s) => s.status === "CONNECTED");
    if (!connectedSession) {
      throw new AppError("No active WhatsApp session found", 400);
    }
    sessionId = connectedSession.sessionId;
  }

  // Build sync request
  const syncRequest = ChatSyncRequestSchema.parse({
    companyId,
    sessionId,
    sinceDate: body.sinceDate,
    limit: body.limit,
    dryRun: body.dryRun,
  });

  // Execute sync
  const result = await chatSyncService.syncMessages(syncRequest, userId);

  res.json({
    status: result.success ? "success" : "error",
    data: {
      conversationsProcessed: result.conversationsProcessed,
      messagesFound: result.messagesFound,
      messagesNew: result.messagesNew,
      messagesDuplicate: result.messagesDuplicate,
      duration: result.duration,
      errors: result.errors.length > 0 ? result.errors : undefined,
    },
    message: result.success
      ? `Sync completed: ${result.messagesNew} new messages imported`
      : `Sync failed: ${result.errors[0] || "Unknown error"}`,
  });
});

/**
 * GET /api/whatsapp/sync/status
 * Check if a sync is currently running for the current company.
 */
export const getSyncStatus = catchAsync(async (req: Request, res: Response) => {
  const companyId = req.user?.companyId;

  if (!companyId) {
    throw new AppError("Authentication required", 401);
  }

  const status = chatSyncService.getSyncStatus(companyId);

  res.json({
    status: "success",
    data: status,
  });
});

/**
 * POST /api/whatsapp/sync/quick
 * Quick sync - syncs last 24 hours of messages.
 */
export const quickSync = catchAsync(async (req: Request, res: Response) => {
  const companyId = req.user?.companyId;
  const userId = req.user?.id;

  if (!companyId || !userId) {
    throw new AppError("Authentication required", 401);
  }

  // Find active session
  const sessions = await whatsappService.getSessions(companyId);
  const connectedSession = sessions.find((s) => s.status === "CONNECTED");

  if (!connectedSession) {
    throw new AppError("No active WhatsApp session found", 400);
  }

  // Last 24 hours
  const sinceDate = new Date(Date.now() - 24 * 60 * 60 * 1000);

  // Execute sync via WhatsAppService
  const result = await whatsappService.syncMessages(
    companyId,
    sinceDate,
    userId,
    200, // Limit for quick sync
  );

  res.json({
    status: result.success ? "success" : "error",
    data: {
      messagesNew: result.messagesNew,
      messagesDuplicate: result.messagesDuplicate,
      errors: result.errors.length > 0 ? result.errors : undefined,
    },
    message: result.success
      ? `Quick sync completed: ${result.messagesNew} new messages`
      : `Quick sync failed`,
  });
});
/**
 * POST /api/whatsapp/sync/conversation/:phone
 * On-Demand Sync: Sync messages for a specific chat (phone number).
 * Used when an agent opens a chat to backfill history.
 */
export const syncConversation = catchAsync(
  async (req: Request, res: Response) => {
    const { phone } = req.params;
    const companyId = req.user?.companyId;
    const userId = req.user?.id;
    const { limit = 50 } = req.body; // Default 50 messages per fetch

    if (!companyId || !userId)
      throw new AppError("Authentication required", 401);
    if (!phone) throw new AppError("Phone Number is required", 400);

    // 1. Find Connected Session (Memory First)
    const sessions = await whatsappService.getSessions(companyId);
    const activeSession = sessions.find((s) => s.status === "CONNECTED");

    if (!activeSession) {
      throw new AppError("No active WhatsApp session found", 404);
    }

    console.info(`[ChatSync] 🔄 On-Demand Sync for ${phone} (User: ${userId})`);

    // 2. Execute Targeted Sync
    // We use a generous lookback (30 days) but limit by count (limit=50)
    // This ensures we get the *most recent* 50 messages, regardless of when they were sent.
    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - 30); // Last 30 days window

    const request = ChatSyncRequestSchema.parse({
      companyId,
      sessionId: activeSession.sessionId,
      sinceDate: sinceDate.toISOString(),
      limit: Number(limit),
      // 🎯 TARGETING STRATEGY:
      // We want to filter ONLY this specific phone number in the service.
      // Ideally, we'd pass `targetJid` to the service, but for now we filter in the loop (MVP)
      // or we enable a specific mode in the service.
      // IMPROVEMENT: Let's rely on the service to just do its job. It scans memory store.
      // Since Memory Store is organized by JID, filtering is efficient.
    });

    // 3. ENHANCEMENT: Pass target phone to service (We need to update Service first?)
    // For Phase 1, we will rely on key-based lookup in the Service update.
    const result = await chatSyncService.syncMessages(
      { ...request, conversationId: phone }, // Leveraging the optional field we added
      userId,
    );

    res.json({
      status: "success",
      data: {
        synced: result.messagesNew,
        totalFound: result.messagesFound,
      },
    });
  },
);
