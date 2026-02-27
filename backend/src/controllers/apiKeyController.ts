import { Response } from "express";
import { catchAsync } from "@/utils/catchAsync";
import { AuthenticatedRequest } from "@/types/types";
import { apiKeyService } from "@/services/apiKeyService";

export const listApiKeys = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const companyId = req.companyId || req.user?.companyId;
    if (!companyId) throw new Error("Company ID missing");

    const keys = await apiKeyService.findAll(companyId);
    res.json(keys);
  },
);

export const createApiKey = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const companyId = req.companyId || req.user?.companyId;
    const { name } = req.body;

    if (!companyId) throw new Error("Company ID missing");

    const userId = req.user?.id;
    const apiKey = await apiKeyService.create(companyId, userId, name);

    res.status(201).json(apiKey);
  },
);

export const revokeApiKey = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;
    const companyId = req.companyId || req.user?.companyId;
    if (!companyId) throw new Error("Company ID missing");

    const userId = req.user?.id;
    await apiKeyService.revoke(id, companyId, userId);

    res.status(204).send();
  },
);
