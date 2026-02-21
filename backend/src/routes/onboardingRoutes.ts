import { Router } from "express";
import { registerCompany } from "@/controllers/onboardingController";
import { validate } from "@/middleware/validationMiddleware";
import { OnboardingSchema } from "@/schemas/onboarding.schema";

const router = Router();

// Route definition
router.post("/", validate(OnboardingSchema), registerCompany);

export default router;
