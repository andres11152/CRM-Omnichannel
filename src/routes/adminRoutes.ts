import { Router } from 'express';
import { listCompanies, createCompany, listPlans, savePlan, deletePlan, updateCompanyStatus, impersonateCompany } from '@/controllers/adminController';
import { validate } from '@/middleware/validationMiddleware';
import { updateCompanyStatusSchema, createCompanySchema, savePlanSchema } from '@/middleware/adminSchemas';

const router = Router();

// Nota: La protección (protect, superAdminGuard) se aplica en server.ts antes de usar este router.

router.get('/companies', listCompanies);
router.post('/companies', validate(createCompanySchema), createCompany);
router.patch(
  '/companies/:companyId/status',
  validate(updateCompanyStatusSchema), // <-- APLICAMOS LA VALIDACIÓN AQUÍ
  updateCompanyStatus
);
router.post('/companies/:companyId/impersonate', impersonateCompany);

router.get('/plans', listPlans);
router.post('/plans', validate(savePlanSchema), savePlan);
router.delete('/plans/:planId', deletePlan);

export default router;