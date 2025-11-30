import { Response } from "express";
import { whatsappService } from "@/services/whatsapp.service";
import { catchAsync } from "@/utils/catchAsync";
import { AuthenticatedRequest } from "@/types/types";

export const createSession = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    console.log("[WhatsAppController] createSession called");
    if (!req.companyId) {
      console.error("[WhatsAppController] No company ID in request");
      throw new Error("No company ID");
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
