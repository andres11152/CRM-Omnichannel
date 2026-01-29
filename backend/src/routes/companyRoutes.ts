import { Router } from "express";
import {
  getCompanySettings,
  updateCompanySettings,
} from "@/controllers/companyController";
import { getEmailConfig } from "@/controllers/companyEmailConfigController";
import { protect } from "@/middleware/authMiddleware";
import { validate } from "@/middleware/validationMiddleware";
import { z } from "zod";

const router = Router();

// Validation Schema
const updateCompanySettingsSchema = z.object({
  body: z.object({
    general: z
      .object({
        name: z.string().optional(),
        logo: z.string().optional(),
        slug: z.string().optional(),
        address: z.string().optional(),
        phone: z.string().optional(),
        website: z.string().optional(),
        timezone: z.string().optional(),
      })
      .optional(),
    smtp: z
      .object({
        host: z.string().optional(),
        port: z.union([z.string(), z.number()]).optional(),
        user: z.string().optional(),
        password: z.string().optional(),
        secure: z.boolean().optional(),
        senderEmail: z.string().email().optional().or(z.literal("")),
        senderName: z.string().optional(),
        provider: z.string().optional(),
      })
      .optional(),
    businessHours: z
      .object({
        enabled: z.boolean().optional(),
        schedule: z
          .record(
            z.object({
              open: z.string(),
              close: z.string(),
              active: z.boolean(),
            }),
          )
          .optional(),
      })
      .optional(),
    automation: z
      .object({
        welcomeMessage: z.string().optional(),
        welcomeEnabled: z.boolean().optional(),
        oooMessage: z.string().optional(),
        oooEnabled: z.boolean().optional(),
      })
      .optional(),
  }),
});

router.use(protect);

router.get("/settings", getCompanySettings);
router.patch(
  "/settings",
  validate(updateCompanySettingsSchema),
  updateCompanySettings,
);
router.get("/email-config", getEmailConfig);

export default router;
