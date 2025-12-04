import { Response } from "express";
import { whatsappService } from "@/services/whatsapp.service";
import { catchAsync } from "@/utils/catchAsync";
import { AuthenticatedRequest } from "@/types/types";
import { prisma } from "@/config/prisma";
import { AppError } from "@/utils/AppError";

export const createSession = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    console.log("[WhatsAppController] createSession called");
    if (!req.companyId) {
      console.error("[WhatsAppController] No company ID in request");
      throw new Error("No company ID");
    }

    // 1. Check Plan Limits
    const company = await prisma.company.findUnique({
      where: { id: req.companyId },
      include: { plan: true, whatsappSessions: true },
    });

    if (!company) {
      throw new AppError("Company not found", 404);
    }

    const maxSessions = (company.plan?.config as any)?.max_whatsapp || 1; // Default to 1 if no plan or config
    const currentSessions = company.whatsappSessions.length;

    if (currentSessions >= maxSessions) {
      throw new AppError(
        `Plan limit reached. Your plan allows ${maxSessions} WhatsApp connection(s). Please upgrade to add more.`,
        403
      );
    }

    const session = await whatsappService.createSession(req.companyId);

    res.status(201).json({
      status: "success",
      data: { session },
    });
  }
);

export const getSessions = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    console.log("[WhatsAppController] getSessions called");
    if (!req.companyId) {
      console.error("[WhatsAppController] No company ID in request");
      throw new Error("No company ID");
    }

    const sessions = await whatsappService.listSessions(req.companyId);

    res.status(200).json({
      status: "success",
      data: { sessions },
    });
  }
);

export const deleteSession = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const { sessionId } = req.params;
    await whatsappService.deleteSession(sessionId);

    res.status(204).json({
      status: "success",
      data: null,
    });
  }
);
