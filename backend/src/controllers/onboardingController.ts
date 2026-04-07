import { Request, Response } from "express";
import { catchAsync } from "@/utils/catchAsync";
import { AppError } from "@/utils/AppError";
import { onboardingService } from "@/services/OnboardingService";

/**
 * SaaS ONBOARDING CONTROLLER
 * Handles the creation of new tenants (Companies) and their initial admin user.
 */
export const registerCompany = catchAsync(
  async (req: Request, res: Response) => {
    const { companyName, adminEmail, adminPassword, plan, slug } = req.body;

    if (!companyName || !adminEmail || !adminPassword) {
      throw new AppError(
        "Por favor, proporcione nombre de la compañía, email y contraseña del administrador.",
        400,
      );
    }

    const result = await onboardingService.registerCompany({
      companyName,
      adminEmail,
      adminPassword,
      plan,
      slug,
    });

    res.status(201).json({
      status: "success",
      message: "Compañía registrada exitosamente. Por favor, inicie sesión.",
      companyId: result.company.id,
      adminId: result.user.id,
    });
  },
);
