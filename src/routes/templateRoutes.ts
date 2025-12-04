import { Router } from "express";
import { protect } from "@/middleware/authMiddleware";
import {
  getTemplates,
  createTemplate,
  deleteTemplate,
} from "@/controllers/templateController";

const router = Router();

// router.use(protect); // Handled in server.ts

router.route("/").get(getTemplates).post(createTemplate);

router.route("/:id").delete(deleteTemplate);

export default router;
