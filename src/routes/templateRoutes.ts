import { Router } from "express";
import { protect } from "@/middleware/authMiddleware";
import { validate } from "@/middleware/validationMiddleware";
import {
  getTemplates,
  getTemplate,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  testTemplateSend,
} from "@/controllers/templateController";
import {
  CreateTemplateSchema,
  UpdateTemplateSchema,
  GetTemplatesSchema,
  GetTemplateSchema,
  DeleteTemplateSchema,
  TestTemplateSendSchema,
} from "@/schemas/template.schema";

const router = Router();

// router.use(protect); // Handled in server.ts

/**
 * 📝 TEMPLATE ROUTES
 * All routes include Zod validation for security and data integrity
 */

// GET /templates?category=MARKETING&search=welcome
// POST /templates
router
  .route("/")
  .get(validate(GetTemplatesSchema), getTemplates)
  .post(validate(CreateTemplateSchema), createTemplate);

// GET /templates/:id
// PATCH /templates/:id
// DELETE /templates/:id
router
  .route("/:id")
  .get(validate(GetTemplateSchema), getTemplate)
  .patch(validate(UpdateTemplateSchema), updateTemplate)
  .delete(validate(DeleteTemplateSchema), deleteTemplate);

// POST /templates/:id/test
// Test template by sending to a phone number
router
  .route("/:id/test")
  .post(validate(TestTemplateSendSchema), testTemplateSend);

export default router;
