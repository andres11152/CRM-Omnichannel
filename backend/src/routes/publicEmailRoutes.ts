import { Router } from "express";
import { unsubscribeContact } from "@/controllers/publicEmailController";

/**
 * Public (no `protect`) — CAN-SPAM/GDPR one-click unsubscribe link clicked
 * from an email client. Safety comes from the HMAC token, not auth.
 */
const router = Router();

router.get("/unsubscribe/:companyId/:contactId/:token", unsubscribeContact);

export default router;
