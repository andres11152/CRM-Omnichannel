import { Request, Response } from "express";
import { catchAsync } from "@/utils/catchAsync";
import { AppError } from "@/utils/AppError";
import { onboardingService } from "@/services/OnboardingService";
import { sessionService } from "@/services/SessionService";
import { signAccessToken, setAuthCookies, TokenPayload } from "@/controllers/authController";

/**
 * SaaS ONBOARDING CONTROLLER
 * Handles the creation of new tenants (Companies) and their initial admin user.
 * Automatically logs in the newly registered company administrator.
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

    const user = result.user;
    const company = result.company;

    // Create session and set cookies automatically for instant login
    const ipAddress = req.ip || req.socket.remoteAddress || "IP no disponible";
    const userAgent = req.get("user-agent") || "User-Agent no disponible";

    const { sessionId, refreshToken } = await sessionService.createSession({
      userId: user.id,
      companyId: company.id,
      ip: ipAddress,
      userAgent,
    });

    const tokenPayload: TokenPayload = {
      id: user.id,
      role: user.role || "ADMIN",
      email: user.email,
      name: user.name || "Admin",
      companyId: company.id,
      companyStatus: company.status,
      planId: company.planId,
      sessionId,
    };
    const token = signAccessToken(tokenPayload);

    // Set HTTP-only cookies
    setAuthCookies(res, token, refreshToken);

    res.status(201).json({
      status: "success",
      token,
      data: {
        user: {
          id: user.id,
          name: user.name || "Admin",
          email: user.email,
          role: user.role,
          companyId: company.id,
          company: company,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
          preferences: user.preferences,
        },
      },
    });
  },
);

