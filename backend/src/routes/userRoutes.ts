import { Router } from "express";
import {
  getUsers,
  getUser,
  updateUser,
  deleteUser,
  createUser,
} from "@/controllers/usersController";
import { getAgentMetrics } from "@/controllers/agentMetricsController";
import { protect } from "@/middleware/authMiddleware";
import { validate } from "@/middleware/validationMiddleware";
import { checkPlanLimit } from "@/middleware/planLimitsMiddleware";
import { AuthenticatedRequest } from "@/types/types";
import { UpdateUserSchema, CreateUserSchema } from "@/schemas/user.schema";

const router = Router();

// Todas las rutas de aquí para abajo están protegidas
router.use(protect);

// Get current authenticated user
router.get("/me", (req: AuthenticatedRequest, res) => {
  // El middleware protect ya agregó el usuario a req.user
  if (!req.user) {
    return res.status(401).json({ error: "No autorizado" });
  }

  res.json({
    user: {
      id: req.user.id,
      name: req.user.name,
      email: req.user.email,
      role: req.user.role,
      companyId: req.user.companyId,
      preferences: req.user.preferences,
      profilePicUrl: req.user.profilePicUrl,
      phone: req.user.phone,
      about: req.user.about,
    },
  });
});

// Métricas de agentes (NUEVO)
router.get("/metrics", getAgentMetrics);

router
  .route("/")
  .get(getUsers)
  .post(checkPlanLimit("users"), validate(CreateUserSchema), createUser);

router
  .route("/:id")
  .get(getUser)
  .patch(validate(UpdateUserSchema), updateUser)
  .delete(deleteUser);

export default router;
