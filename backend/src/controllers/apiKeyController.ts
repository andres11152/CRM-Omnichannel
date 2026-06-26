import { Response } from "express";
import { catchAsync } from "@/utils/catchAsync";
import { AppError } from "@/utils/AppError";
import { AuthenticatedRequest } from "@/types/types";
import { apiKeyService } from "@/services/ApiKeyService";

export const listApiKeys = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const companyId = req.companyId ?? req.user?.companyId;
    if (!companyId) throw new AppError("Unauthorized", 401);

    const keys = await apiKeyService.findAll(companyId);
    res.json({ status: "success", data: keys });
  },
);

export const createApiKey = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const companyId = req.companyId ?? req.user?.companyId;
    if (!companyId) throw new AppError("Unauthorized", 401);

    const { name } = req.body;
    const userId = req.user?.id;
    const apiKey = await apiKeyService.create(companyId, userId, name);

    res.status(201).json({ status: "success", data: apiKey });
  },
);

export const revokeApiKey = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;
    const companyId = req.companyId ?? req.user?.companyId;
    if (!companyId) throw new AppError("Unauthorized", 401);

    const userId = req.user?.id;
    await apiKeyService.revoke(id, companyId, userId);

    res.status(204).send();
  },
);
