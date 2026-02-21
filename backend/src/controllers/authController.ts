import { Request, Response, NextFunction } from "express";
import { AuthenticatedRequest } from "@/types/types";
import { catchAsync } from "@/utils/catchAsync";
import { AppError } from "@/utils/AppError";
import { prisma } from "@/config/database";
import bcrypt from "bcryptjs";
import jwt, { SignOptions } from "jsonwebtoken";
import TenantContextManager from "@/config/tenantContext";
import { Logger } from "@/utils/logger";
import crypto from "crypto";
import { emailService } from "@/services/emailService";

export interface TokenPayload {
  id: string;
  role: string;
  companyId?: string | null;
  companyStatus?: string;
  planId?: string | null;
}

/**
 * Genera un token JWT firmado.
 */
export const signToken = (payload: TokenPayload) => {
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    throw new AppError("JWT_SECRET no está definido en el archivo .env", 500);
  }
  const expiresIn = "7d" as jwt.SignOptions["expiresIn"];
  const options: SignOptions = {
    expiresIn,
  };
  return jwt.sign({ ...payload }, jwtSecret, options);
};

export const signup = catchAsync(
  async (req: Request, res: Response, _next: NextFunction) => {
    // Body is validated by Route-level validationMiddleware
    const { name, email, password, companyId } = req.body;

    const hashedPassword = await bcrypt.hash(password, 12);

    const newUser = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        companyId: companyId || undefined,
        role: companyId ? "AGENT" : "ADMIN",
      },
    });

    const token = signToken({
      id: newUser.id,
      role: newUser.role || "user",
      companyId: newUser.companyId,
    });

    res.status(201).json({
      status: "success",
      token,
      data: {
        user: {
          id: newUser.id,
          email: newUser.email,
          name: newUser.name,
          createdAt: newUser.createdAt,
          updatedAt: newUser.updatedAt,
        },
      },
    });
  },
);

export const login = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    // Body is validated by Route-level validationMiddleware
    const { email, password } = req.body;

    Logger.info(`[Auth] Attempting login for email: ${email}`);

    const user = await TenantContextManager.runAsSystem(async () =>
      prisma.user.findUnique({
        where: { email },
        include: {
          company: {
            include: { plan: true },
          },
        },
      }),
    );

    if (!user || !(await bcrypt.compare(password, user.password))) {
      return next(new AppError("Email o contraseña incorrectos", 401));
    }

    if (user.company) {
      const restrictedStatuses = ["BANNED"];
      if (restrictedStatuses.includes(user.company.status)) {
        return next(
          new AppError(
            `Acceso denegado: Su cuenta está en estado ${user.company.status}. Contacte a soporte.`,
            403,
          ),
        );
      }
    }

    const tokenPayload: TokenPayload = {
      id: user.id,
      role: user.role || "user",
      companyId: user.companyId,
      companyStatus: user.company?.status,
      planId: user.company?.planId,
    };
    const token = signToken(tokenPayload);

    // 🔐 Send login notification email (async)
    const ipAddress = req.ip || req.socket.remoteAddress || "IP no disponible";
    const userAgent = req.get("user-agent") || "User-Agent no disponible";

    import("@/services/loginNotificationService").then(
      ({ sendLoginNotification }) => {
        sendLoginNotification({
          userEmail: user.email,
          userName: user.name,
          ipAddress,
          userAgent,
          timestamp: new Date(),
        }).catch((err) => {
          Logger.error("[Auth] Failed to send security notification", err);
        });
      },
    );

    res.status(200).json({
      status: "success",
      token,
      data: {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          companyId: user.companyId,
          company: user.company,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
          preferences: user.preferences,
        },
      },
    });
  },
);

export const updatePassword = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const user = await prisma.user.findUnique({ where: { id: req.user?.id } });
    if (!user) return next(new AppError("User not found", 404));

    const { currentPassword, newPassword } = req.body;

    if (!(await bcrypt.compare(currentPassword, user.password))) {
      return next(new AppError("Tu contraseña actual es incorrecta.", 401));
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({
      where: { id: user.id },
      data: { password: hashedPassword },
    });

    const token = signToken({
      id: user.id,
      role: user.role,
      companyId: user.companyId,
    });

    res.status(200).json({
      status: "success",
      token,
      message: "Contraseña actualizada correctamente.",
    });
  },
);

export const forgotPassword = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { email } = req.body;

    const user = await TenantContextManager.runAsSystem(async () =>
      prisma.user.findUnique({ where: { email } }),
    );
    if (!user) {
      return next(new AppError("No existe usuario con ese email.", 404));
    }

    const resetToken = crypto.randomBytes(32).toString("hex");
    const passwordResetToken = crypto
      .createHash("sha256")
      .update(resetToken)
      .digest("hex");
    const passwordResetExpires = new Date(Date.now() + 10 * 60 * 1000);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        resetPasswordToken: passwordResetToken,
        resetPasswordExpires: passwordResetExpires,
      },
    });

    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
    const resetUrl = `${frontendUrl}/reset-password/${resetToken}`;

    const message = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>Restablecer Contraseña</h2>
      <p>Has solicitado restablecer tu contraseña en Reply CRM.</p>
      <p>Haz clic en el siguiente botón para continuar (válido por 10 minutos):</p>
      <a href="${resetUrl}" style="display: inline-block; padding: 12px 24px; background-color: #4f46e5; color: white; text-decoration: none; border-radius: 6px;">Restablecer Contraseña</a>
      <p style="margin-top: 20px; font-size: 12px; color: #666;">Si no solicitaste esto, ignora este correo.</p>
    </div>
  `;

    try {
      await emailService.sendEmail({
        to: user.email,
        subject: "Recuperación de Contraseña - Reply CRM",
        html: message,
      });

      res.status(200).json({
        status: "success",
        message: "Token enviado al correo.",
      });
    } catch (error: unknown) {
      const err = error as Error & Partial<AppError>;
      await prisma.user.update({
        where: { id: user.id },
        data: { resetPasswordToken: null, resetPasswordExpires: null },
      });
      const errorMessage =
        err.message || "Hubo un error enviando el correo. Intenta de nuevo.";
      return next(new AppError(errorMessage, err.statusCode || 500));
    }
  },
);

export const resetPassword = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const hashedToken = crypto
      .createHash("sha256")
      .update(req.params.token)
      .digest("hex");

    const user = await TenantContextManager.runAsSystem(async () =>
      prisma.user.findFirst({
        where: {
          resetPasswordToken: hashedToken,
          resetPasswordExpires: { gt: new Date() },
        },
        include: { company: true },
      }),
    );

    if (!user) {
      return next(new AppError("Token inválido o expirado.", 400));
    }

    const { password } = req.body;

    const hashedPassword = await bcrypt.hash(password, 12);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        resetPasswordToken: null,
        resetPasswordExpires: null,
      },
    });

    const token = signToken({
      id: user.id,
      role: user.role,
      companyId: user.companyId,
      companyStatus: user.company?.status,
      planId: user.company?.planId,
    });

    res.status(200).json({
      status: "success",
      token,
      message: "Contraseña restablecida correctamente.",
    });
  },
);
