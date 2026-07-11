import { Router } from "express";
import { contactController } from "../controllers/contactController";
import { protect } from "../middleware/authMiddleware";
import { validate } from "../middleware/validationMiddleware";
import {
  CreateContactSchema,
  GetContactDetailSchema,
  GetContactsSchema,
  DeleteContactSchema,
  SetContactBlockStatusSchema,
  SetContactBlockStatusByPhoneSchema,
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
  auditLog("Contact", (req) => {
    const body = req.body as Record<string, unknown>;
    return (body?.phone as string) || (body?.email as string) || "unknown";
  }), // Log Upsert intent
  contactController.upsertContact,
);

import { UpdateContactSchema } from "../schemas/contactSchema";

// PATCH /contacts/:id
// Partial update for specific fields (like tags)
router.patch(
  "/:id",
  validate(UpdateContactSchema),
  auditLog("Contact", () => "partial_update"),
  contactController.updateContact,
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

// PATCH /contacts/by-phone/block-status
// Resolved by phone (find-or-create) — used by the chat header, which often
// only has the conversation's phone (Conversation.contactId is frequently
// unset for WhatsApp shadow-user conversations). MUST be registered before
// the "/:id/block-status" route below — both are 2-segment paths, and
// "/by-phone/block-status" would otherwise be matched as ":id" = "by-phone"
// by the dynamic route since Express matches in registration order.
router.patch(
  "/by-phone/block-status",
  validate(SetContactBlockStatusByPhoneSchema),
  auditLog("Contact", (req) => {
    const body = req.body as Record<string, unknown>;
    return `${body?.blocked ? "block" : "unblock"}:${body?.phone}`;
  }),
  contactController.setBlockStatusByPhone,
);

// PATCH /contacts/:id/block-status
// Block or unblock a contact (CRM spam-gate flag + real WhatsApp block via Baileys)
router.patch(
  "/:id/block-status",
  validate(SetContactBlockStatusSchema),
  auditLog("Contact", (req) => {
    const body = req.body as Record<string, unknown>;
    return body?.blocked ? "block" : "unblock";
  }),
  contactController.setBlockStatus,
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
