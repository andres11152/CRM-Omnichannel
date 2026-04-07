import { Router } from "express";
import { contactController } from "../controllers/contactController";
import { protect } from "../middleware/authMiddleware";
import { validate } from "../middleware/validationMiddleware";
import {
  CreateContactSchema,
  GetContactDetailSchema,
  GetContactsSchema,
  DeleteContactSchema,
} from "../schemas/contactSchema";

import { auditLog } from "../middleware/auditMiddleware";

const router = Router();

// [SEC] All routes require authentication
router.use(protect);

/**
 *  CONTACT ROUTES
 * All routes include Zod validation for security and data integrity
 */

// GET /contacts/detail?id=xxx or ?phone=xxx
// Get specific contact by ID or phone
router.get(
  "/detail",
  validate(GetContactDetailSchema),
  contactController.getContactDetail,
);

// GET /contacts?search=xxx&limit=50&offset=0
// List contacts with optional search and pagination
router.get("/", validate(GetContactsSchema), contactController.getContacts);

// POST /contacts
// Create or update contact (upsert logic)
router.post(
  "/",
  validate(CreateContactSchema),
  auditLog("Contact", (req) => req.body.phone || req.body.email || "unknown"), // Log Upsert intent
  contactController.upsertContact,
);

import { IdParamSchema } from "../schemas/commonSchemas";

// GET /contacts/:id/timeline
// Get contact activity timeline
router.get(
  "/:id/timeline",
  validate(IdParamSchema),
  contactController.getContactTimeline,
);

// DELETE /contacts/:id
// Soft delete contact
router.delete(
  "/:id",
  validate(DeleteContactSchema),
  auditLog("Contact"), // Log Deletion
  contactController.deleteContact,
);

// POST /contacts/import
// Bulk import contacts from CSV/Excel
// Note: Must be defined AFTER other routes to avoid conflicts with /:id
router.post(
  "/import",
  auditLog("Contact_Import", () => "bulk_operation"), // Log Bulk Import action
  async (req, res, next) => {
    // Dynamic import of upload middleware
    const { uploadSingle, handleMulterError } =
      await import("../middleware/uploadMiddleware");
    uploadSingle(req, res, (err) => {
      if (err) {
        return handleMulterError(err, req, res, next);
      }
      next();
    });
  },
  contactController.importContacts,
);

export const contactRouter = router;
