import { Router } from "express";
import { protect } from "@/middleware/authMiddleware";
import * as instagramController from "@/controllers/instagramController";

const router = Router();

router.use(protect);

router.post("/sessions", instagramController.createSession);
router.get("/sessions", instagramController.getSessions);
router.delete("/sessions/:id", instagramController.deleteSession);

export default router;
