import { Router } from "express";
import { protect } from "@/middleware/authMiddleware";
import { validate } from "@/middleware/validationMiddleware";
import {
  getNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
} from "@/controllers/notificationsController";
import {
  GetNotificationsSchema,
  NotificationIdParamSchema,
} from "@/schemas/commonSchemas";

const router = Router();

// All routes require authentication
router.use(protect);

router.get("/", validate(GetNotificationsSchema), getNotifications);
router.patch("/:id/read", validate(NotificationIdParamSchema), markAsRead);
router.patch("/read-all", markAllAsRead);
router.delete("/:id", validate(NotificationIdParamSchema), deleteNotification);

export default router;
