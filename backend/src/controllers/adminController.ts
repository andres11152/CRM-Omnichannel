import { Response } from "express";
import { AuthenticatedRequest, CompanyStatus } from "@/types/types";
import { adminService } from "@/services/AdminService";
import { catchAsync } from "@/utils/catchAsync";
import { AppError } from "@/utils/AppError";
import { Logger } from "@/utils/logger";
import {
  createCompanySchema,
  updateCompanySchema,
  updateCompanyStatusSchema,
  savePlanSchema,
} from "@/schemas/adminSchemas";

/**
 * SUPER ADMIN CONTROLLER
 * Protected by SuperAdminGuard (Middleware checking role === 'master')
 */

export const listCompanies = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const companies = await adminService.getAllCompanies();
    res.json(companies);
  },
);

export const createCompany = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    // [SEC] Strict Validation
    const companyData = createCompanySchema.parse(req.body);

    const newCompany = await adminService.createCompany(companyData);

    // Log sensitive action safe
    Logger.info(
      `[Admin] Company ${newCompany.name} created by ${req.user?.email}`,
    );
    res.status(201).json(newCompany);
  },
);

export const updateCompanyStatus = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const { companyId } = req.params;

    if (!companyId) throw new AppError("Company ID required", 400);

    // [SEC] Strict Validation of Body
    const { status } = updateCompanyStatusSchema.parse(req.body);

    const updated = await adminService.updateCompanyStatus(
      companyId,
      status as CompanyStatus,
    );
    Logger.info(
      `[Admin] Company ${companyId} status set to ${status} by ${req.user?.email}`,
    );

    res.json(updated);
  },
);

export const updateCompany = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const { companyId } = req.params;

    if (!companyId) throw new AppError("Company ID required", 400);

    const updateData = updateCompanySchema.parse(req.body);

    const updatedCompany = await adminService.updateCompany(
      companyId,
      updateData,
    );
    Logger.info(`[Admin] Company ${companyId} updated by ${req.user?.email}`);
    res.json(updatedCompany);
  },
);

export const impersonateCompany = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const { companyId } = req.params;

    if (!companyId) throw new AppError("Company ID required", 400);

    const result = await adminService.generateImpersonationToken(companyId);

    Logger.warn(
      `[Security] IMPERSONATION: ${req.user?.email} (${req.user?.id}) impersonating company ${companyId} as user ${result.user.email}`,
    );

    res.json({
      success: true,
      token: result.token,
      user: {
        id: result.user.id,
        email: result.user.email,
        role: result.user.role,
      },
      _security:
        "Send this token via X-Impersonation-Token header, never in URL",
    });
  },
);

export const getCompanyMetrics = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const { companyId } = req.params;
    if (!companyId) throw new AppError("Company ID required", 400);

    const metrics = await adminService.getCompanyMetrics(companyId);
    res.json(metrics);
  },
);

export const getSystemStatus = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const status = await adminService.getSystemStatus();
    res.json(status);
  },
);

export const getDashboardStats = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const stats = await adminService.getDashboardStats();
    res.json(stats);
  },
);

// --- PLAN MANAGEMENT ---

export const listPlans = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const plans = await adminService.getAllPlans();
    res.json(plans);
  },
);

export const savePlan = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    // [SEC] Strict Validation via Zod schema
    const planData = savePlanSchema.parse(req.body);

    Logger.info(
      `[AdminController] Received request to save plan: ${planData.id}`,
    );

    const saved = await adminService.savePlan(planData);

    Logger.info(`[Admin] Plan ${saved.id} saved/updated by ${req.user?.email}`);
    res.json(saved);
  },
);

export const deletePlan = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const { planId } = req.params;

    if (!planId) throw new AppError("Plan ID required", 400);

    await adminService.deletePlan(planId);
    Logger.info(`[Admin] Plan ${planId} deleted by ${req.user?.email}`);
    res.status(204).send();
  },
);
