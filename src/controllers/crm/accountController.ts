import { Response, NextFunction } from "express";
import { AppError } from "../../utils/AppError";
import { catchAsync } from "../../utils/catchAsync";
import { AuthenticatedRequest } from "../../types";
import { prisma } from "../../config/prisma";

// Get all accounts for a company
export const getAccounts = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const companyId = req.user?.companyId;

    if (!companyId) {
      return next(new AppError("Company ID is missing", 400));
    }

    const accounts = await prisma.account.findMany({
      where: { companyId },
      include: {
        _count: {
          select: { contacts: true, deals: true },
        },
      },
      orderBy: { updatedAt: "desc" },
    });

    res.status(200).json({
      status: "success",
      results: accounts.length,
      data: { accounts },
    });
  }
);

// Get single account
export const getAccount = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const { id } = req.params;
    const companyId = req.user?.companyId;

    const account = await prisma.account.findFirst({
      where: { id, companyId },
      include: {
        contacts: true,
        deals: true,
        activities: {
          orderBy: { createdAt: "desc" },
          take: 10,
          include: { createdBy: { select: { name: true, email: true } } },
        },
      },
    });

    if (!account) {
      return next(new AppError("Account not found", 404));
    }

    res.status(200).json({
      status: "success",
      data: { account },
    });
  }
);

// Create account
export const createAccount = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const companyId = req.user?.companyId;
    const { name, industry, website, size, address, status } = req.body;

    if (!companyId) {
      return next(new AppError("Company ID is missing", 400));
    }

    const account = await prisma.account.create({
      data: {
        companyId,
        name,
        industry,
        website,
        size,
        address,
        status: status || "ACTIVE",
      },
    });

    res.status(201).json({
      status: "success",
      data: { account },
    });
  }
);

// Update account
export const updateAccount = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const { id } = req.params;
    const companyId = req.user?.companyId;

    const account = await prisma.account.findFirst({
      where: { id, companyId },
    });

    if (!account) {
      return next(new AppError("Account not found", 404));
    }

    const updatedAccount = await prisma.account.update({
      where: { id },
      data: req.body,
    });

    res.status(200).json({
      status: "success",
      data: { account: updatedAccount },
    });
  }
);

// Delete account
export const deleteAccount = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const { id } = req.params;
    const companyId = req.user?.companyId;

    const account = await prisma.account.findFirst({
      where: { id, companyId },
    });

    if (!account) {
      return next(new AppError("Account not found", 404));
    }

    await prisma.account.delete({ where: { id } });

    res.status(204).json({
      status: "success",
      data: null,
    });
  }
);
