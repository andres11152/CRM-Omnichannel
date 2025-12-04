import { Response, NextFunction } from "express";
import { prisma } from "@/config/prisma";
import { catchAsync } from "@/utils/catchAsync";
import { AuthenticatedRequest } from "@/types/types";
import { AppError } from "@/utils/AppError";

// --- AI CONFIG (API KEYS) ---

export const getAIConfig = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const companyId = req.companyId || req.user?.companyId;

    const config = await prisma.aIConfig.findUnique({
      where: { companyId },
    });

    // Mask keys for security
    if (config) {
      config.openaiKey = config.openaiKey
        ? `${config.openaiKey.substring(0, 3)}...${config.openaiKey.slice(-4)}`
        : null;
      config.geminiKey = config.geminiKey
        ? `${config.geminiKey.substring(0, 3)}...${config.geminiKey.slice(-4)}`
        : null;
    }

    res.status(200).json(config || {});
  }
);

export const updateAIConfig = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const { openaiKey, geminiKey } = req.body;
    const companyId = req.companyId || req.user?.companyId;

    if (!companyId) return next(new AppError("Company ID missing", 400));

    // Upsert config
    const config = await prisma.aIConfig.upsert({
      where: { companyId },
      update: {
        openaiKey: openaiKey === "" ? null : openaiKey || undefined,
        geminiKey: geminiKey === "" ? null : geminiKey || undefined,
      },
      create: {
        companyId,
        openaiKey: openaiKey || null,
        geminiKey: geminiKey || null,
      },
    });

    res.status(200).json({ status: "success", message: "AI Config updated" });
  }
);

// --- AI ASSISTANTS (PERSONAS) ---

export const getAssistants = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const companyId = req.companyId || req.user?.companyId;

    const assistants = await prisma.aIAssistant.findMany({
      where: { companyId },
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { queues: true } },
      },
    });

    res.status(200).json(assistants);
  }
);

export const createAssistant = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const {
      name,
      description,
      modelProvider,
      modelName,
      systemPrompt,
      temperature,
    } = req.body;
    const companyId = req.companyId || req.user?.companyId;

    if (!companyId) return next(new AppError("Company ID missing", 400));

    const assistant = await prisma.aIAssistant.create({
      data: {
        companyId,
        name,
        description,
        modelProvider,
        modelName,
        systemPrompt,
        temperature: temperature || 0.7,
      },
    });

    res.status(201).json(assistant);
  }
);

export const updateAssistant = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const { id } = req.params;
    const data = req.body;
    const companyId = req.companyId || req.user?.companyId;

    // Verify ownership
    const existing = await prisma.aIAssistant.findFirst({
      where: { id, companyId },
    });
    if (!existing) return next(new AppError("Assistant not found", 404));

    const assistant = await prisma.aIAssistant.update({
      where: { id },
      data: {
        name: data.name,
        description: data.description,
        modelProvider: data.modelProvider,
        modelName: data.modelName,
        systemPrompt: data.systemPrompt,
        temperature: data.temperature,
      },
    });

    res.status(200).json(assistant);
  }
);

export const deleteAssistant = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const { id } = req.params;
    const companyId = req.companyId || req.user?.companyId;

    const existing = await prisma.aIAssistant.findFirst({
      where: { id, companyId },
    });
    if (!existing) return next(new AppError("Assistant not found", 404));

    await prisma.aIAssistant.delete({ where: { id } });

    res.status(204).send();
  }
);

export const testAI = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const { assistantId, message } = req.body;
    const companyId = req.companyId || req.user?.companyId;

    if (!companyId) return next(new AppError("Company ID missing", 400));

    const { generateAIResponse } = await import("@/services/aiResponseService");

    const response = await generateAIResponse(
      companyId,
      assistantId,
      message || "Hello",
      []
    );

    if (!response) {
      return res
        .status(500)
        .json({
          status: "error",
          message: "AI generation failed. Check server logs.",
        });
    }

    res.status(200).json({ status: "success", response });
  }
);
