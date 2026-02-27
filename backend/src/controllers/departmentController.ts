import { Response, NextFunction } from "express";
import { AppError } from "../utils/AppError";
import { catchAsync } from "../utils/catchAsync";
import { AuthenticatedRequest } from "../types";
import { departmentService } from "../services/departmentService";

/**
 * 🏗️ DEPARTMENT CONTROLLER
 *
 * HTTP orchestrator for departments.
 * All data access delegated to departmentService (SRP).
 */

// Get all departments
export const getDepartments = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const companyId = req.companyId || req.user?.companyId;

    if (!companyId) {
      return next(new AppError("Company ID not found", 400));
    }

    const departments = await departmentService.findAll(companyId);

    res.status(200).json(departments);
  },
);

// Create department
export const createDepartment = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const companyId = req.companyId || req.user?.companyId;

    if (!companyId) {
      return next(new AppError("Company ID not found", 400));
    }

    const department = await departmentService.create(companyId, req.body.name);

    res.status(201).json(department);
  },
);

// Update department
export const updateDepartment = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const { id } = req.params;
    const companyId = req.companyId || req.user?.companyId;

    if (!companyId) {
      return next(new AppError("Company ID not found", 400));
    }

    const updated = await departmentService.update(id, companyId, req.body);

    res.status(200).json(updated);
  },
);

// Delete department
export const deleteDepartment = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const { id } = req.params;
    const companyId = req.companyId || req.user?.companyId;

    if (!companyId) {
      return next(new AppError("Company ID not found", 400));
    }

    await departmentService.delete(id, companyId);

    res.status(204).json(null);
  },
);
