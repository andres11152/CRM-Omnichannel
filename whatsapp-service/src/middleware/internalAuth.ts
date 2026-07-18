import { Request, Response, NextFunction } from "express";
import { Logger } from "../utils/logger";

const SHARED_SECRET = process.env.WHATSAPP_INTERNAL_SECRET;

// Fail closed: if the secret isn't configured, reject every request rather
// than silently letting the service run wide open. The main API and this
// service must be given the same WHATSAPP_INTERNAL_SECRET value.
export const internalAuth = (req: Request, res: Response, next: NextFunction): void => {
  if (!SHARED_SECRET) {
    Logger.error("[Auth] WHATSAPP_INTERNAL_SECRET is not configured — refusing request.");
    res.status(503).json({ error: "Service misconfigured: missing internal auth secret." });
    return;
  }

  const provided = req.header("x-internal-service-key");
  if (provided !== SHARED_SECRET) {
    Logger.warn(`[Auth] Rejected request to ${req.method} ${req.path}: invalid or missing internal service key.`);
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  next();
};
