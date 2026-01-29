import { Router } from "express";
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
  updateCompanyStatusSchema,
  createCompanySchema,
  savePlanSchema,
} from "@/middleware/adminSchemas";

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
router.post("/billing/retry", retryTransaction);
router.get("/companies", listCompanies);
router.post("/companies", validate(createCompanySchema), createCompany);
router.put("/companies/:companyId", updateCompany);
router.patch(
  "/companies/:companyId/status",
  validate(updateCompanyStatusSchema), // <-- APLICAMOS LA VALIDACIÓN AQUÍ
  updateCompanyStatus
);
router.post("/companies/:companyId/impersonate", impersonateCompany);
router.get("/companies/:companyId/metrics", getCompanyMetrics);

router.get("/plans", listPlans);
router.post("/plans", validate(savePlanSchema), savePlan);
router.delete("/plans/:planId", deletePlan);

export default router;
