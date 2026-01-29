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

const router = express.Router();

// ===================================
// EMAIL ROUTES
// ===================================

// Test SMTP Connection (Authenticated)
router.post("/test-connection", protect, testEmailConnection);

// Send email (authenticated)
router.post("/send", protect, sendEmail);

// Webhook receiver (no auth - public endpoint for email providers)
router.post("/webhook", receiveWebhook);

// Get emails by contact
router.get("/contact/:contactId", protect, getEmailsByContact);

// Get emails by ticket
router.get("/ticket/:ticketId", protect, getEmailsByTicket);

// ===================================
// TIMELINE ROUTES
// ===================================

// Get unified timeline
router.get("/timeline", protect, getTimeline);

// Get timeline stats for a contact
router.get("/timeline/:contactId/stats", protect, getTimelineStats);

export default router;
