import { Router } from "express";
import {
  getCompanySettings,
  updateCompanySettings,
  importWhatsAppContacts,
  deleteAllContactsNuclear,
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

// [WA-CONTACTS] Manual, on-demand import of WhatsApp contacts (real phones only).
router.post("/import-whatsapp-contacts", importWhatsAppContacts);

// [ADMIN-ONLY] Nuclear cleanup for dev/staging (deletes ALL contacts across all tenants).
router.delete("/admin/nuke-all-contacts", deleteAllContactsNuclear);

export default router;

