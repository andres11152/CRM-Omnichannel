import { Router } from "express";
// Note: protect middleware is applied at server.ts mount level
import {
  listApiKeys,
  createApiKey,
  revokeApiKey,
} from "@/controllers/apiKeyController";

const router = Router();

// El middleware protect ya se aplica en server.ts antes de montar, o se puede aplicar aquí.
// En server.ts veo: app.use("/api/users", apiLimiter, protect, userRouter);
// Así que lo aplicaré en server.ts para consistencia, pero no hace daño aquí.

router.get("/", listApiKeys);
router.post("/", createApiKey);
router.delete("/:id", revokeApiKey);

export default router;
