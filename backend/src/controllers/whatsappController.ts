import { Response } from "express";
// ♻️ REFACTOR: Unified Service (Split Brain Fix)
import { whatsappService } from "@/whatsapp";
import { planLimitsService } from "@/services/planLimitsService";
import { catchAsync } from "@/utils/catchAsync";
import { AuthenticatedRequest } from "@/types/types";
import { prisma } from "@/config/database";
import { AppError } from "@/utils/AppError";

export const createSession = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    console.log("[WhatsAppController] createSession called");
    if (!req.companyId) {
      console.error("[WhatsAppController] No company ID in request");
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

    // 🔍 FETCH FROM DB (Truth Source) instead of Memory
    // This ensures we get the persisted 'phone' number and other metadata
    const sessions = await prisma.whatsAppSession.findMany({
      where: { companyId: req.companyId },
      select: {
        sessionId: true,
        status: true,
        phone: true,
        qrCode: true,
        defaultQueueId: true,
      },
    });

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

    // Verify ownership
    const session = await prisma.whatsAppSession.findFirst({
      where: { sessionId, companyId: req.companyId },
    });

    if (!session) {
      throw new AppError("Session not found", 404);
    }

    const updated = await prisma.whatsAppSession.update({
      where: { sessionId },
      data: { defaultQueueId } as any,
    });

    res.status(200).json({
      status: "success",
      data: { session: updated },
    });
  },
);

export const reconnectSession = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const { sessionId } = req.params;

    // Verify ownership
    const session = await prisma.whatsAppSession.findFirst({
      where: { sessionId, companyId: req.companyId },
    });

    if (!session) {
      throw new AppError("Session not found", 404);
    }

    // Force initialization
    console.log(
      `[WhatsAppController] Manual reconnect requested for ${sessionId}`,
    );

    // We don't await this to keep the API responsive, but we do trigger it
    whatsappService
      .reconnectSession(sessionId)
      .catch((e) =>
        console.error(`[WhatsAppController] Manual reconnect failed `, e),
      );

    res.status(200).json({
      status: "success",
      message: "Reconnection process started",
    });
  },
);
