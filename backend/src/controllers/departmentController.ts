import { Response, NextFunction } from "express";
import { prisma } from "../config/database";
import { AppError } from "../utils/AppError";
import { catchAsync } from "../utils/catchAsync";
import { AuthenticatedRequest } from "../types";

// Get all departments
export const getDepartments = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const companyId = req.companyId || req.user?.companyId;

    if (!companyId) {
      return next(new AppError("Company ID not found", 400));
    }

    const departments = await prisma.department.findMany({
      where: { companyId },
      orderBy: { name: "asc" },
      include: {
        _count: {
          select: { queues: true },
        },
      },
    });

    res.status(200).json(departments);
  }
);

// Create department
export const createDepartment = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const { name } = req.body;
    const companyId = req.companyId || req.user?.companyId;

    if (!companyId) {
      return next(new AppError("Company ID not found", 400));
    }

    const existing = await prisma.department.findFirst({
      where: { companyId, name: { equals: name, mode: "insensitive" } },
    });

    if (existing) {
      return next(new AppError("Department already exists", 400));
    }

    const department = await prisma.department.create({
      data: {
        name,
        companyId,
      },
    });

    res.status(201).json(department);
  }
);

// Update department
export const updateDepartment = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const { id } = req.params;
    const { name } = req.body;
    const companyId = req.companyId || req.user?.companyId;

    if (!companyId) {
      return next(new AppError("Company ID not found", 400));
    }

    const department = await prisma.department.findFirst({
      where: { id, companyId },
    });

    if (!department) {
      return next(new AppError("Department not found", 404));
    }

    // Check if name is already taken by another department
    if (name && name !== department.name) {
      const existing = await prisma.department.findFirst({
        where: {
          companyId,
          name: { equals: name, mode: "insensitive" },
          id: { not: id },
        },
      });

      if (existing) {
        return next(new AppError("Department name already exists", 400));
      }
    }

    const updated = await prisma.department.update({
      where: { id },
      data: { name },
    });

    res.status(200).json(updated);
  }
);

// Delete department
export const deleteDepartment = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const { id } = req.params;
    const companyId = req.companyId || req.user?.companyId;

    const department = await prisma.department.findFirst({
      where: { id, companyId },
    });

    if (!department) {
      return next(new AppError("Department not found", 404));
    }

    await prisma.department.delete({
      where: { id },
    });

    res.status(204).json(null);
  }
);
