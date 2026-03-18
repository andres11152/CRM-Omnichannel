import express from "express";
import {
  sendEmail,
  receiveWebhook,
  getEmailsByContact,
  getEmailsByTicket,
  getTimeline,
  getTimelineStats,
  testEmailConnection,
} from "../controllers/emailController";
import { protect } from "../middleware/authMiddleware";
import { validate } from "../middleware/validationMiddleware";
import {
  SendEmailSchema,
  TestEmailConnectionSchema,
  GetEmailsByContactSchema,
  GetEmailsByTicketSchema,
  GetTimelineSchema,
  GetTimelineStatsSchema,
} from "../schemas/emailSchema";

const router = express.Router();

// ===================================
// EMAIL ROUTES
// ===================================

// Test SMTP Connection (Authenticated + Validated)
router.post(
  "/test-connection",
  protect,
  validate(TestEmailConnectionSchema),
  testEmailConnection,
);

// Send email (authenticated + validated)
router.post("/send", protect, validate(SendEmailSchema), sendEmail);

// Webhook receiver (no auth - public endpoint for email providers)
// NOTE: Webhooks are NOT validated via Zod since payload formats
// vary wildly between providers (SendGrid, Mailgun, etc.)
router.post("/webhook", receiveWebhook);

// Get emails by contact (validated params)
router.get(
  "/contact/:contactId",
  protect,
  validate(GetEmailsByContactSchema),
  getEmailsByContact,
);

// Get emails by ticket (validated params)
router.get(
  "/ticket/:ticketId",
  protect,
  validate(GetEmailsByTicketSchema),
  getEmailsByTicket,
);

// ===================================
// TIMELINE ROUTES
// ===================================

// Get unified timeline (validated query params)
router.get("/timeline", protect, validate(GetTimelineSchema), getTimeline);

// Get timeline stats for a contact (validated params)
router.get(
  "/timeline/:contactId/stats",
  protect,
  validate(GetTimelineStatsSchema),
  getTimelineStats,
);

export default router;
