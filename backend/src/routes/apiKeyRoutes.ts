import { Router } from "express";
import {
  listApiKeys,
  createApiKey,
  revokeApiKey,
} from "@/controllers/apiKeyController";
import { validate } from "@/middleware/validationMiddleware";
import {
  CreateApiKeySchema,
  RevokeApiKeySchema,
} from "@/schemas/commonSchemas";

const router = Router();

router.get("/", listApiKeys);
router.post("/", validate(CreateApiKeySchema), createApiKey);
router.delete("/:id", validate(RevokeApiKeySchema), revokeApiKey);

export default router;
