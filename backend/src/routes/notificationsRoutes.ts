import { Router } from "express";
import { protect } from "@/middleware/authMiddleware";
import {
  getNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
} from "@/controllers/notificationsController";

const router = Router();

// All routes require authentication
router.use(protect);

router.get("/", getNotifications);
router.patch("/:id/read", markAsRead);
router.patch("/read-all", markAllAsRead);
router.delete("/:id", deleteNotification);

export default router;
