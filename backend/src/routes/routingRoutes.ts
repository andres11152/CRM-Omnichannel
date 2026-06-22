import { Router } from "express";
import { getRoutingConfig, updateRoutingConfig } from "@/controllers/routingConfigController";
import { protect } from "@/middleware/authMiddleware";
import { validate } from "@/middleware/validationMiddleware";
import { UpdateRoutingConfigSchema } from "@/schemas/routingSchema";

const router = Router();

router.use(protect);

router
  .route("/")
  .get(getRoutingConfig)
  .patch(validate(UpdateRoutingConfigSchema), updateRoutingConfig);

export default router;
