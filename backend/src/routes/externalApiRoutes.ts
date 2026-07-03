import { Router } from "express";
import { protect } from "@/middleware/authMiddleware";
import { externalApiLimiter } from "@/middleware/advancedRateLimiter";
import { apiAccessLogger } from "@/middleware/apiAccessLogger";
import { requireScope } from "@/middleware/requireScope";
import {
  listContacts,
  getContact,
  createContact,
  updateContact,
  sendMessage,
  listConversations,
  listDeals,
  createDeal,
  listTickets,
  listProperties,
  getProperty,
  createProperty,
} from "@/controllers/externalApiController";

/**
 * [EXTERNAL API] PUBLIC REST API v1
 *
 * Base path: /api/v1/external
 * Authentication: X-API-Key header (handled by protect middleware)
 * Rate limit: 100 req/min per key
 * Logging: apiAccessLogger (async DB logging)
 * Authorization: requireScope (granular permissions)
 *
 * All endpoints return standardized JSON:
 * { status: "success" | "error", data: T, meta?: { page, limit, total } }
 */

const router = Router();

// All external routes require API Key authentication + strict rate limiting + access logging
router.use(externalApiLimiter, protect, apiAccessLogger);

// --- CONTACTS ---
router.get("/contacts", requireScope("contacts:read"), listContacts);
router.get("/contacts/:id", requireScope("contacts:read"), getContact);
router.post("/contacts", requireScope("contacts:write"), createContact);
router.patch("/contacts/:id", requireScope("contacts:write"), updateContact);

// --- MESSAGING ---
router.post("/messages/send", requireScope("messages:send"), sendMessage);

// --- CONVERSATIONS ---
router.get("/conversations", requireScope("messages:read"), listConversations);

// --- DEALS ---
router.get("/deals", requireScope("deals:read"), listDeals);
router.post("/deals", requireScope("deals:write"), createDeal);

// --- TICKETS ---
router.get("/tickets", requireScope("tickets:read"), listTickets);

// --- PROPERTIES (Real Estate) ---
router.get("/properties", requireScope("properties:read"), listProperties);
router.get("/properties/:id", requireScope("properties:read"), getProperty);
router.post("/properties", requireScope("properties:write"), createProperty);

export default router;
