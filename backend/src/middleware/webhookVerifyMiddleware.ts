import { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { AppError } from "@/utils/AppError";
import { Logger } from "@/utils/logger";

export interface RequestWithRawBody extends Request {
  rawBody?: Buffer;
}

/**
 * Express Middleware to cryptographically verify X-Hub-Signature-256 headers
 * against the configured META_APP_SECRET App Secret from Meta.
 */
export const verifyMetaWebhookSignature = (
  req: RequestWithRawBody,
  res: Response,
  next: NextFunction
) => {
  try {
    const signature = req.headers["x-hub-signature-256"] as string | undefined;
    const appSecret = process.env.META_APP_SECRET;

    // Log warning and pass if secret is not configured to allow fallback testing in local systems
    if (!appSecret) {
      Logger.warn("[WebhookVerify] META_APP_SECRET is not configured in environment. Bypassing signature verification.");
      return next();
    }

    if (!signature) {
      return next(new AppError("Missing signature header: X-Hub-Signature-256", 401));
    }

    const parts = signature.split("=");
    if (parts.length !== 2 || parts[0] !== "sha256") {
      return next(new AppError("Invalid signature format in X-Hub-Signature-256 header", 401));
    }

    const expectedSignature = parts[1];
    const rawBody = req.rawBody;

    if (!rawBody) {
      return next(new AppError("Raw body is required for signature verification", 400));
    }

    const hmac = crypto.createHmac("sha256", appSecret);
    const calculatedSignature = hmac.update(rawBody).digest("hex");

    const expectedBuf = Buffer.from(expectedSignature, "hex");
    const calculatedBuf = Buffer.from(calculatedSignature, "hex");

    // Prevent timing attacks and verify signature securely
    if (
      expectedBuf.length !== calculatedBuf.length ||
      !crypto.timingSafeEqual(expectedBuf, calculatedBuf)
    ) {
      Logger.warn("[WebhookVerify] Webhook signature verification failed: Signatures mismatch");
      return next(new AppError("Invalid webhook request signature", 403));
    }

    next();
  } catch (error) {
    next(error);
  }
};
