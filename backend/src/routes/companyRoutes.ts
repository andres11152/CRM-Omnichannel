import { Router } from "express";
import {
  getCompanySettings,
  updateCompanySettings,
} from "@/controllers/companyController";
import { getEmailConfig } from "@/controllers/companyEmailConfigController";
import { protect } from "@/middleware/authMiddleware";
import { validate } from "@/middleware/validationMiddleware";
import { UpdateCompanySettingsSchema } from "@/schemas/companySchema";

const router = Router();

router.use(protect);

router.get("/settings", getCompanySettings);
router.patch(
  "/settings",
  validate(UpdateCompanySettingsSchema),
  updateCompanySettings,
);
router.get("/email-config", getEmailConfig);

export default router;

