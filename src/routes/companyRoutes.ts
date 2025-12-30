import { Router } from "express";
import {
  getCompanySettings,
  updateCompanySettings,
} from "@/controllers/companyController";
import { getEmailConfig } from "@/controllers/companyEmailConfig.controller";

const router = Router();

router.get("/settings", getCompanySettings);
router.patch("/settings", updateCompanySettings);
router.get("/email-config", getEmailConfig);

export default router;
