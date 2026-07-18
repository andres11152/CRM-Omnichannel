import { Router } from "express";
import { MessageController } from "../controllers/MessageController";

const router = Router();

router.post("/send", MessageController.sendMessage);
router.post("/presence", MessageController.sendPresence);
router.post("/reaction", MessageController.sendReaction);
router.post("/edit", MessageController.editMessage);
router.post("/revoke", MessageController.revokeMessage);

export default router;
