import { Router } from "express";
import { SessionController } from "../controllers/SessionController";

const router = Router();

router.post("/", SessionController.initSession);
router.delete("/:sessionId", SessionController.terminateSession);
router.post("/:sessionId/reconnect", SessionController.reconnectSession);
router.get("/status/:sessionId", SessionController.getStatus);
router.get("/:companyId", SessionController.listSessions);

export default router;
