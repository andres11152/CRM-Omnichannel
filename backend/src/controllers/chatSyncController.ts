/**
 * 🔄 CHAT SYNC CONTROLLER
 *
 * Enterprise-grade REST API for triggering historical message synchronization.
 * Follows Controller-Service-Repository architecture.
 */

import { Request, Response } from "express";
import { z } from "zod";
import { catchAsync } from "@/utils/catchAsync";
import { AppError } from "@/utils/AppError";
import {
  chatSyncService,
  ChatSyncRequestSchema,
} from "@/services/chatSyncService";
import { whatsappService } from "@/whatsapp";

// ========================
// REQUEST SCHEMAS
// ========================

const TriggerSyncSchema = z.object({
  sessionId: z.string().optional(),
  sinceDate: z.string().datetime().optional(),
  limit: z.number().int().positive().max(1000).default(500),
  dryRun: z.boolean().default(false),
});

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

  // Validate request body
  const body = TriggerSyncSchema.parse(req.body);

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
