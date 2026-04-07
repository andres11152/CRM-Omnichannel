import { Response, NextFunction } from "express";
import { catchAsync } from "@/utils/catchAsync";
import { AppError } from "@/utils/AppError";
import { AuthenticatedRequest } from "@/types/types";
import { tagService } from "@/services/TagService";

/**
 * ️ TAG CONTROLLER
 *
 * HTTP orchestrator for tags.
 * All data access delegated to tagService (SRP).
 */

export const createTag = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const { name, color } = req.body;
    const companyId = req.companyId || req.user?.companyId;

    if (!companyId) {
      return next(new AppError("Company ID missing", 400));
    }

    const tag = await tagService.create(companyId, name, color);
    res.status(201).json(tag);
  },
);

export const getTags = catchAsync(
  async (req: AuthenticatedRequest, res: Response, _next: NextFunction) => {
    const companyId = req.companyId || req.user?.companyId;

    if (!companyId) {
      return res.status(200).json([]);
    }

    const tags = await tagService.findAll(companyId);
    res.status(200).json(tags);
  },
);

export const deleteTag = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const { id } = req.params;
    const companyId = req.companyId || req.user?.companyId;

    if (!companyId) {
      return next(new AppError("Company ID missing", 400));
    }

    await tagService.delete(id, companyId);
    res.status(204).send();
  },
);
