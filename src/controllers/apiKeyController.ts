import { Response, NextFunction } from "express";
import { catchAsync } from "@/utils/catchAsync";
import { prisma } from "@/config/prisma";
import { AuthenticatedRequest } from "@/types/types";
import crypto from "crypto";
import bcrypt from "bcrypt";

export const listApiKeys = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const companyId = req.companyId || req.user?.companyId;
    const keys = await prisma.apiKey.findMany({
      where: { companyId },
      select: {
        id: true,
        name: true,
        keyPrefix: true,
        createdAt: true,
        lastUsedAt: true,
      },
      orderBy: { createdAt: "desc" },
    });
    res.json(keys);
  }
);

export const createApiKey = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const companyId = req.companyId || req.user?.companyId;
    const { name } = req.body;

    if (!companyId) throw new Error("Company ID missing");

    const rawKey = "sk_live_" + crypto.randomBytes(24).toString("hex");
    const keyPrefix = rawKey.substring(0, 15) + "...";
    // Use a fast hash for API keys or store hashed. Bcrypt is slow for per-request auth,
    // but for now it's fine. Ideally use SHA256 for API keys.
    // Let's use SHA256 for performance on every request.
    const keyHash = crypto.createHash("sha256").update(rawKey).digest("hex");

    const apiKey = await prisma.apiKey.create({
      data: {
        companyId,
        name: name || "API Key",
        keyPrefix,
        keyHash,
      },
    });

    // Return rawKey ONLY ONCE
    res.status(201).json({ ...apiKey, secretKey: rawKey });
  }
);

export const revokeApiKey = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;
    const companyId = req.companyId || req.user?.companyId;

    await prisma.apiKey.deleteMany({
      where: { id, companyId },
    });

    res.status(204).send();
  }
);
