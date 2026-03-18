import { Router } from "express";
import { Request, Response } from "express";
import { pushNotificationService } from "@/services/pushNotificationService";
import { catchAsync } from "@/utils/catchAsync";
import { Logger } from "@/utils/logger";
import { validate } from "@/middleware/validationMiddleware";
import {
  PushSubscribeSchema,
  PushUnsubscribeSchema,
} from "@/schemas/commonSchemas";

const router = Router();

/**
 * 🔔 PUSH NOTIFICATION ROUTES
 */

/**
 * Get VAPID public key
 */
router.get("/vapid-public-key", (req: Request, res: Response) => {
  res.json({
    publicKey: pushNotificationService.getPublicKey(),
  });
});

/**
 * Subscribe to push notifications
 */
router.post(
  "/subscribe",
  validate(PushSubscribeSchema),
  catchAsync(async (req: Request, res: Response) => {
    const user = (req as unknown as { user: { id: string; companyId: string } })
      .user;
    const { subscription } = req.body;

    await pushNotificationService.subscribe({
      userId: user.id,
      companyId: user.companyId,
      endpoint: subscription.endpoint,
      keys: {
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
      },
    });

    Logger.info("User subscribed to push notifications", {
      userId: user.id,
      companyId: user.companyId,
    });

    res.json({
      success: true,
      message: "Subscribed successfully",
    });
  }),
);

/**
 * Unsubscribe from push notifications
 */
router.post(
  "/unsubscribe",
  validate(PushUnsubscribeSchema),
  catchAsync(async (req: Request, res: Response) => {
    const user = (req as unknown as { user: { id: string; companyId: string } })
      .user;
    const { endpoint } = req.body;

    await pushNotificationService.unsubscribe(user.id, endpoint);

    Logger.info("User unsubscribed from push notifications", {
      userId: user.id,
    });

    res.json({
      success: true,
      message: "Unsubscribed successfully",
    });
  }),
);

/**
 * Test push notification (dev only)
 */
if (process.env.NODE_ENV === "development") {
  router.post(
    "/test",
    catchAsync(async (req: Request, res: Response) => {
      const user = (
        req as unknown as { user: { id: string; companyId: string } }
      ).user;

      await pushNotificationService.sendToUser(user.id, {
        title: "🔔 Test Notification",
        body: "This is a test push notification from Reply CRM",
        icon: "/icon-192x192.png",
        data: { type: "test" },
      });

      Logger.info("Test push notification sent", { userId: user.id });

      res.json({
        success: true,
        message: "Test notification sent",
      });
    }),
  );
}

export default router;
