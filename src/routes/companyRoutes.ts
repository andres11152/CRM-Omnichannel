import { Router } from "express";
import {
  getCompanySettings,
  updateCompanySettings,
} from "@/controllers/companyController";

const router = Router();

router.get("/settings", getCompanySettings);
router.patch("/settings", updateCompanySettings);

export default router;
