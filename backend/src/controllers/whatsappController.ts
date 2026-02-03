import { Logger } from "@/utils/logger";
import { Response } from "express";
// ♻️ REFACTOR: Unified Service (Split Brain Fix)
import { whatsappService } from "@/whatsapp";
import { planLimitsService } from "@/services/planLimitsService";
import { catchAsync } from "@/utils/catchAsync";
import { AuthenticatedRequest } from "@/types/types";
import { AppError } from "@/utils/AppError";

export const createSession = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    Logger.info("[WhatsAppController] createSession called");
    if (!req.companyId) {
      Logger.error("[WhatsAppController] No company ID in request");
      throw new Error("No company ID");
    }

    // 1. Check Plan Limits
    const canCreate = await planLimitsService.canCreateResource(
      req.companyId,
      "whatsapp_sessions",
    );

    if (!canCreate) {
      const { limit } = await planLimitsService.checkPlanLimit(
        req.companyId,
        "whatsapp_sessions",
      );
      throw new AppError(
        `Plan limit reached. Your plan allows ${limit} WhatsApp connection(s). Please upgrade to add more.`,
        403,
      );
    }

    const session = await whatsappService.createSession(req.companyId);

    res.status(201).json({
      status: "success",
      data: { session },
    });
  },
);

export const getSessions = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    if (!req.companyId) {
      throw new Error("No company ID");
    }

    // 🔍 FETCH FROM SERVICE (Repository abstraction)
    const sessions = await whatsappService.getSessions(req.companyId);

    res.status(200).json({
      status: "success",
      data: { sessions },
    });
  },
);

export const deleteSession = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const { sessionId } = req.params;
    await whatsappService.deleteSession(sessionId);

    res.status(204).json({
      status: "success",
      data: null,
    });
  },
);

export const updateSession = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const { sessionId } = req.params;
    const { defaultQueueId } = req.body;

    if (!req.companyId) {
      throw new AppError("No company ID", 401);
    }

    const updated = await whatsappService.updateSessionQueue(
      req.companyId,
      sessionId,
      defaultQueueId,
    );

    res.status(200).json({
      status: "success",
      data: { session: updated },
    });
  },
);

export const reconnectSession = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const { sessionId } = req.params;

    // Force initialization
    Logger.info(
      `[WhatsAppController] Manual reconnect requested for ${sessionId}`,
    );

    // We don't await this to keep the API responsive, but we do trigger it
    whatsappService
      .reconnectSession(sessionId)
      .catch((e) =>
        Logger.error(`[WhatsAppController] Manual reconnect failed `, e),
      );

    res.status(200).json({
      status: "success",
      message: "Reconnection process started",
    });
  },
);
