import { Response } from "express";
import { Logger } from "@/utils/logger";
import { catchAsync } from "@/utils/catchAsync";
import { AppError } from "@/utils/AppError";
import { AuthenticatedRequest } from "@/types/types";
import { instagramSessionRepository } from "@/instagram/InstagramSessionRepository";

export const createSession = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    if (!req.companyId) {
      throw new AppError("No company ID", 401);
    }

    const { accessToken, igBusinessAccountId, pageId, verifyToken, username } = req.body;

    if (!accessToken || !igBusinessAccountId || !pageId || !verifyToken) {
      throw new AppError(
        "accessToken, igBusinessAccountId, pageId y verifyToken son requeridos",
        400,
      );
    }

    const session = await instagramSessionRepository.create({
      company: { connect: { id: req.companyId } },
      igBusinessAccountId,
      pageId,
      accessToken,
      verifyToken,
      username,
      status: "CONNECTED",
    });

    Logger.info(`[InstagramController] Session created for company ${req.companyId}`);

    res.status(201).json({ status: "success", data: { session } });
  },
);

export const getSessions = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    if (!req.companyId) {
      throw new AppError("No company ID", 401);
    }

    const sessions = await instagramSessionRepository.findByCompany(req.companyId);

    res.status(200).json({ status: "success", data: { sessions } });
  },
);

export const deleteSession = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    if (!req.companyId) {
      throw new AppError("No company ID", 401);
    }

    const { id } = req.params;
    await instagramSessionRepository.delete(req.companyId, id);

    res.status(204).json({ status: "success", data: null });
  },
);
