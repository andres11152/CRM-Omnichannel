import { Router } from "express";
import { z } from "zod";
import {
  listCompanies,
  createCompany,
  listPlans,
  savePlan,
  deletePlan,
  updateCompanyStatus,
  updateCompany,
  impersonateCompany,
  getCompanyMetrics,
  getDashboardStats,
  getSystemStatus,
} from "@/controllers/adminController";
import { validate } from "@/middleware/validationMiddleware";
import {
  CreateCompanyValidator,
  UpdateCompanyValidator,
  UpdateCompanyStatusValidator,
  SavePlanValidator,
  DeletePlanValidator,
} from "@/schemas/adminSchemas";

const router = Router();

// Nota: La protección (protect, superAdminGuard) se aplica en server.ts antes de usar este router.

import {
  getFinancialAnalytics,
  getGlobalActivity,
  getTenantHealth,
} from "@/controllers/analyticsController";
import {
  getTransactions,
  retryTransaction,
} from "@/controllers/billingController";

router.get("/system-status", getSystemStatus);
router.get("/dashboard-stats", getDashboardStats);
router.get("/analytics/financials", getFinancialAnalytics);
router.get("/analytics/activity", getGlobalActivity);
router.get("/analytics/tenant-health", getTenantHealth);

// Billing Ops
router.get("/billing/transactions", getTransactions);
router.post(
  "/billing/retry",
  validate(
    z.object({
      body: z.object({ transactionId: z.string().min(1) }),
    }),
  ),
  retryTransaction,
);
router.get("/companies", listCompanies);
router.post("/companies", validate(CreateCompanyValidator), createCompany);
router.put(
  "/companies/:companyId",
  validate(UpdateCompanyValidator),
  updateCompany,
);
router.patch(
  "/companies/:companyId/status",
  validate(UpdateCompanyStatusValidator), // <-- APLICAMOS LA VALIDACIÓN AQUÍ
  updateCompanyStatus,
);
// Common param schema
const companyIdSchema = z.object({
  params: z.object({ companyId: z.string().min(1) }),
});

router.post(
  "/companies/:companyId/impersonate",
  validate(companyIdSchema),
  impersonateCompany,
);
router.get(
  "/companies/:companyId/metrics",
  validate(companyIdSchema),
  getCompanyMetrics,
);

router.get("/plans", listPlans);
router.post("/plans", validate(SavePlanValidator), savePlan);
router.delete(
  "/plans/:planId",
  validate(DeletePlanValidator),
  deletePlan,
);

export default router;
