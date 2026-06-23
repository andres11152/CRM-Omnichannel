import { Logger } from "@/utils/logger";
import { Response } from "express";
import type { ParamsDictionary } from "express-serve-static-core";
// ️ REFACTOR: Unified Service (Split Brain Fix)
import { whatsappService } from "@/whatsapp";
import { planLimitsService } from "@/services/PlanLimitsService";
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

    // [SEARCH] FETCH FROM SERVICE (Repository abstraction)
    const sessions = await whatsappService.listSessions(req.companyId);

    res.status(200).json({
      status: "success",
      data: { sessions },
    });
  },
);

export const deleteSession = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    if (!req.companyId) {
      throw new Error("No company ID");
    }
    const { sessionId } = req.params;
    await whatsappService.deleteSession(req.companyId, sessionId);

    res.status(204).json({
      status: "success",
      data: null,
    });
  },
);

export const updateSession = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const { sessionId } = req.params;
    const { defaultQueueId, proxyUrl } = req.body;

    if (!req.companyId) {
      throw new AppError("No company ID", 401);
    }

    const updated = await whatsappService.updateSession(
      req.companyId,
      sessionId,
      { defaultQueueId, proxyUrl },
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
    const companyId = req.companyId!;

    // [SEC] SECURITY: Validate session ownership BEFORE reconnect attempt (BOLA Fix)
    const session = await whatsappService.getSessionRecord(companyId, sessionId);
    if (!session) {
      throw new AppError("Session not found or unauthorized", 404);
    }

    Logger.info(
      `[WhatsAppController] Manual reconnect requested for ${sessionId} (Company: ${companyId})`,
    );

    // Trigger reconnection
    whatsappService.reconnectSession(companyId, sessionId).catch((e) =>
      Logger.error(
        `[WhatsAppController] Manual reconnect failed for ${sessionId}`,
        e,
      ),
    );

    res.status(200).json({
      status: "success",
      message: "Reconnection process started",
    });
  },
);

export const requestPairingCode = catchAsync(
  async (req: AuthenticatedRequest<ParamsDictionary, unknown, { phone: string }>, res: Response) => {
    Logger.info("[WhatsAppController] requestPairingCode called");
    if (!req.companyId) {
      Logger.error("[WhatsAppController] No company ID in request");
      throw new Error("No company ID");
    }

    const { phone } = req.body;

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

    // 2. Request pairing code via service
    const cleanPhone = phone.replace(/\D/g, "");
    const { sessionId, code } = await whatsappService.requestPairingCode(
      req.companyId,
      cleanPhone,
    );

    res.status(200).json({
      status: "success",
      data: { sessionId, code },
    });
  },
);
