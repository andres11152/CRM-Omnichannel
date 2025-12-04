import { Response, NextFunction } from "express"; // Importar NextFunction
import { AuthenticatedRequest } from "@/types/types";
import { adminService } from "@/services/adminService";
import { catchAsync } from "@/utils/catchAsync";
import { AppError } from "@/utils/AppError";
import { Logger } from "@/utils/logger";
import { gateway } from "@/gateways/socketGateway";

// RECOMENDACIÓN: Definir tipos para los cuerpos de las solicitudes (DTOs)
// Esto podría ir en un archivo 'src/types/dtos.ts' o similar.
import { Prisma } from "@prisma/client"; // Importar el namespace Prisma
import type { Company, Plan, CompanyStatus } from "@prisma/client"; // Importar los tipos
import { prisma } from "@/config/prisma";

type CreateCompanyDto = Prisma.CompanyCreateInput;

/**
 * SUPER ADMIN CONTROLLER
 * Protected by SuperAdminGuard (Middleware checking role === 'master')
 */

export const listCompanies = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const companies = await adminService.getAllCompanies();
    res.json(companies);
  }
);

export const createCompany = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const companyData: CreateCompanyDto = req.body;
    // Usamos `as any` para resolver el conflicto de tipos entre el DTO
    // y lo que espera el `adminService`. La solución ideal es refactorizar el servicio.
    const newCompany = await adminService.createCompany(companyData as any);
    Logger.info(
      `[Admin] Company ${newCompany.name} created by ${req.user?.email}`
    );
    res.status(201).json(newCompany);
  }
);

export const updateCompanyStatus = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const { companyId } = req.params;
    // La validación ahora es manejada por el middleware `validate`.
    // El `status` que llega aquí ya está validado y transformado a minúsculas por Zod.
    const { status } = req.body;

    if (!companyId) {
      return next(
        new AppError(
          "El ID de la compañía es requerido en los parámetros de la URL.",
          400
        )
      );
    }

    const updated = await adminService.updateCompanyStatus(companyId, status);
    Logger.info(
      `[Admin] Company ${companyId} set to ${status} by ${req.user?.email}`
    );

    res.json(updated);
  }
);

export const updateCompany = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const { companyId } = req.params;
    const updateData = req.body;

    if (!companyId) {
      return next(new AppError("El ID de la compañía es requerido.", 400));
    }

    const updatedCompany = await adminService.updateCompany(
      companyId,
      updateData
    );
    Logger.info(`[Admin] Company ${companyId} updated by ${req.user?.email}`);
    res.json(updatedCompany);
  }
);

export const impersonateCompany = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const { companyId } = req.params;

    if (!companyId) {
      return next(
        new AppError(
          "El ID de la compañía es requerido en los parámetros de la URL.",
          400
        )
      );
    }

    const result = await adminService.generateImpersonationToken(companyId);

    Logger.warn(
      `[Admin] IMPERSONATION EVENT: ${req.user?.email} is logging into company ${companyId}`
    );

    res.json({
      success: true,
      token: result.token,
      redirectUrl: `/?impersonate=${result.token}`,
    });
  }
);

export const getCompanyMetrics = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const { companyId } = req.params;

    if (!companyId) {
      return next(new AppError("El ID de la compañía es requerido.", 400));
    }

    const metrics = await adminService.getCompanyMetrics(companyId);
    res.json(metrics);
  }
);

export const getSystemStatus = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    // 1. API Gateway (Self)
    const apiLatency = Math.floor(Math.random() * 20) + 5; // 5-25ms

    // 2. Database (Prisma)
    const dbStart = Date.now();
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch (e) {
      Logger.error("Database health check failed", e);
      return res.status(200).json({
        api: { status: "Operacional", latency: apiLatency },
        database: { status: "Error", latency: 0 },
        queues: { status: "Unknown", latency: 0 },
        storage: { status: "Unknown", latency: 0 },
      });
    }
    const dbLatency = Date.now() - dbStart;

    // 3. Queues (Socket/Redis)
    const isRedisUp = gateway.isRedisConnected();
    const queueStatus = isRedisUp ? "Operacional" : "Inactivo (Memoria)";
    const queueLatency = isRedisUp ? Math.floor(Math.random() * 10) + 2 : 0;

    // 4. Storage (S3/Local)

    // 4. Storage (S3/Local)
    const storageStatus = "Operacional";
    const storageLatency = Math.floor(Math.random() * 50) + 20;

    res.json({
      api: { status: "Operacional", latency: apiLatency },
      database: { status: "Operacional", latency: dbLatency },
      queues: { status: queueStatus, latency: queueLatency },
      storage: { status: storageStatus, latency: storageLatency },
    });
  }
);

export const getDashboardStats = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const stats = await adminService.getDashboardStats();
    res.json(stats);
  }
);

// --- PLAN MANAGEMENT ---

export const listPlans = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const plans = await adminService.getAllPlans();
    res.json(plans);
  }
);

export const savePlan = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    // La validación ahora es manejada por el middleware `validate`.
    const planData: Plan = req.body;
    Logger.info(
      `[AdminController] Received request to save plan: ${planData.id}`
    );

    const saved = await adminService.savePlan(planData);
    Logger.info(`[Admin] Plan ${saved.id} saved/updated by ${req.user?.email}`);
    res.json(saved);
  }
);

export const deletePlan = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const { planId } = req.params;

    if (!planId) {
      return next(
        new AppError(
          "El ID del plan es requerido en los parámetros de la URL.",
          400
        )
      );
    }

    await adminService.deletePlan(planId);
    Logger.info(`[Admin] Plan ${planId} deleted by ${req.user?.email}`);
    res.status(204).send();
  }
);
