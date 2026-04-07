import { Request, Response, NextFunction } from "express";
import { AuthenticatedRequest } from "@/types/types";
import { catchAsync } from "@/utils/catchAsync";
import { AppError } from "@/utils/AppError";
import jwt, { SignOptions } from "jsonwebtoken";
import crypto from "crypto";
import { Logger } from "@/utils/logger";
import { getEnv } from "@/config/env";
import { emailService } from "@/services/EmailService";
import { authCrudService } from "@/services/AuthCrudService";
import { sessionService, SESSION_TTL } from "@/services/SessionService";

export interface TokenPayload {
  id: string;
  role: string;
  companyId?: string | null;
  companyStatus?: string;
  planId?: string | null;
  jti?: string;
  sessionId?: string;
}

/**
 * Genera un token JWT firmado.
 */
/**
 * Signs an access token (enterprise-grade, based on JWT_EXPIRES_IN).
 * Each token gets a unique JTI for blacklist-based revocation.
 */
export const signAccessToken = (payload: TokenPayload): string => {
  const jwtSecret = getEnv().JWT_SECRET;
  const jti = crypto.randomUUID();
  const expiresIn = getEnv().JWT_EXPIRES_IN as SignOptions["expiresIn"];
  const options: SignOptions = { expiresIn };
  return jwt.sign({ ...payload, jti }, jwtSecret, options);
};

/**
 * @deprecated Use signAccessToken instead. Kept for backward compatibility.
 */
export const signToken = signAccessToken;

// ============================================================================
//  COOKIE HELPERS
// ============================================================================

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: (process.env.NODE_ENV === "production" ? "strict" : "lax") as
    | "strict"
    | "lax",
  path: "/",
};

const setAuthCookies = (
  res: Response,
  accessToken: string,
  refreshToken: string,
) => {
  // Access token cookie (short-lived)
  res.cookie("access_token", accessToken, {
    ...COOKIE_OPTIONS,
    maxAge: SESSION_TTL.ACCESS_TOKEN * 1000, // 15 min
  });

  // Refresh token cookie (long-lived)
  res.cookie("refresh_token", refreshToken, {
    ...COOKIE_OPTIONS,
    maxAge: SESSION_TTL.REFRESH_TOKEN * 1000, // 7 days
    path: "/api/auth", // Only sent to auth endpoints
  });
};

const clearAuthCookies = (res: Response) => {
  res.clearCookie("access_token", { path: "/" });
  res.clearCookie("refresh_token", { path: "/api/auth" });
};

export const signup = catchAsync(
  async (req: Request, res: Response, _next: NextFunction) => {
    const { name, email, password, companyId } = req.body;

    const newUser = await authCrudService.createUser({
      name,
      email,
      password,
      companyId,
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
    const { email, password } = req.body;

    Logger.info(`[Auth] Attempting login for email: ${email}`);
    const user = await authCrudService.findUserByEmail(email);

    if (!user) {
      Logger.warn(`[Auth] User not found: ${email}`);
      return next(new AppError("Email o contraseña incorrectos", 401));
    }

    Logger.info(`[Auth] User found, verifying password for: ${email}`);
    const isPasswordValid = await authCrudService.verifyPassword(
      password,
      user.password,
    );

    if (!isPasswordValid) {
      Logger.warn(`[Auth] Invalid password for: ${email}`);
      return next(new AppError("Email o contraseña incorrectos", 401));
    }

    Logger.info(`[Auth] Password valid, creating session for: ${email}`);

    // Cast safely using intersection
    const userWithCompany = user as unknown as typeof user & {
      company?: { status: string; planId?: string };
    };

    if (userWithCompany.company) {
      const restrictedStatuses = ["BANNED"];
      if (restrictedStatuses.includes(userWithCompany.company.status)) {
        Logger.warn(`[Auth] Account restricted for: ${email}`);
        return next(
          new AppError(
            `Acceso denegado: Su cuenta está en estado ${userWithCompany.company.status}. Contacte a soporte.`,
            403,
          ),
        );
      }
    }

    //  ENTERPRISE: Create server-side session
    const ipAddress = req.ip || req.socket.remoteAddress || "IP no disponible";
    const userAgent = req.get("user-agent") || "User-Agent no disponible";

    Logger.info(`[Auth] Creating session for user ID: ${user.id}`);
    const { sessionId, refreshToken } = await sessionService.createSession({
      userId: user.id,
      companyId: user.companyId,
      ip: ipAddress,
      userAgent,
    });

    // Sign access token with session binding
    const tokenPayload: TokenPayload = {
      id: user.id,
      role: user.role || "user",
      companyId: user.companyId,
      companyStatus: userWithCompany.company?.status,
      planId: userWithCompany.company?.planId,
      sessionId,
    };
    const token = signAccessToken(tokenPayload);

    //  Set HttpOnly cookies (XSS-proof)
    setAuthCookies(res, token, refreshToken);

    // [AUTH] Send login notification email (async, fire-and-forget)
    import("@/services/LoginNotificationService").then(
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

    // Response includes token in body for backward compatibility (mobile, Postman)
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
          company: userWithCompany.company,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
          preferences: user.preferences,
        },
      },
    });
  },
);

// ============================================================================
//  ENTERPRISE LOGOUT (Server-side session destruction)
// ============================================================================

export const logout = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const jti = (req as AuthenticatedRequest & { jti?: string }).jti;
    const sessionId = (req as AuthenticatedRequest & { sessionId?: string })
      .sessionId;

    // Destroy the session and blacklist the current token
    if (sessionId) {
      await sessionService.destroySession(sessionId, jti);
    } else if (jti) {
      await sessionService.blacklistToken(jti);
    }

    // Clear cookies
    clearAuthCookies(res);

    Logger.info("[Auth]  User logged out", { userId: req.user?.id });

    res.status(200).json({
      status: "success",
      message: "Sesión cerrada correctamente.",
    });
  },
);

// ============================================================================
// [SYNC] TOKEN REFRESH (Rotate access + refresh tokens)
// ============================================================================

export const refreshToken = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    // Read refresh token from cookie
    const incomingRefreshToken = req.cookies?.refresh_token;

    if (!incomingRefreshToken) {
      return next(new AppError("No refresh token provided", 401));
    }

    // Validate and consume the refresh token
    const sessionData =
      await sessionService.validateRefreshToken(incomingRefreshToken);

    if (!sessionData) {
      clearAuthCookies(res);
      return next(
        new AppError(
          "Refresh token inválido o expirado. Inicia sesión nuevamente.",
          401,
        ),
      );
    }

    // Verify user still exists
    const user = await authCrudService.findUserById(sessionData.userId);
    if (!user) {
      clearAuthCookies(res);
      return next(new AppError("Usuario ya no existe.", 401));
    }

    const userWithCompany = user as unknown as typeof user & {
      company?: { status: string; planId?: string };
    };

    // Issue new access token
    const newAccessToken = signAccessToken({
      id: user.id,
      role: user.role || "user",
      companyId: user.companyId,
      companyStatus: userWithCompany.company?.status,
      planId: userWithCompany.company?.planId,
      sessionId: sessionData.sessionId,
    });

    // Rotate refresh token (one-time use)
    const newRefreshToken = await sessionService.rotateRefreshToken(
      sessionData.sessionId,
      sessionData.userId,
      sessionData.companyId,
    );

    // Set new cookies
    setAuthCookies(res, newAccessToken, newRefreshToken);

    res.status(200).json({
      status: "success",
      token: newAccessToken,
    });
  },
);

// ============================================================================
//  ACTIVE SESSIONS (List user's devices)
// ============================================================================

export const getActiveSessions = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const sessions = await sessionService.getUserSessions(req.user!.id);

    res.status(200).json({
      status: "success",
      results: sessions.length,
      data: { sessions },
    });
  },
);

export const revokeSession = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const { sessionId } = req.params;
    await sessionService.destroySession(sessionId);

    res.status(200).json({
      status: "success",
      message: "Sesión revocada correctamente.",
    });
  },
);

export const revokeAllSessions = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const count = await sessionService.destroyAllSessions(req.user!.id);

    clearAuthCookies(res);

    res.status(200).json({
      status: "success",
      message: `Se cerraron ${count} sesiones activas.`,
    });
  },
);

export const updatePassword = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const user = await authCrudService.findUserById(req.user?.id || "");
    if (!user) return next(new AppError("User not found", 404));

    const { currentPassword, newPassword } = req.body;

    if (
      !(await authCrudService.verifyPassword(currentPassword, user.password))
    ) {
      return next(new AppError("Tu contraseña actual es incorrecta.", 401));
    }

    await authCrudService.updatePassword(user.id, newPassword);

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

    const { user, resetToken } =
      await authCrudService.generateResetToken(email);

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
      await authCrudService.clearResetToken(user.id);
      const errorMessage =
        err.message || "Hubo un error enviando el correo. Intenta de nuevo.";
      return next(new AppError(errorMessage, err.statusCode || 500));
    }
  },
);

export const resetPassword = catchAsync(
  async (req: Request, res: Response, _next: NextFunction) => {
    const { password } = req.body;

    const user = await authCrudService.resetPasswordWithToken(
      req.params.token,
      password,
    );

    // Cast safely using intersection
    const userWithCompany = user as unknown as typeof user & {
      company?: { status: string; planId?: string };
    };

    const token = signToken({
      id: user.id,
      role: user.role,
      companyId: user.companyId,
      companyStatus: userWithCompany.company?.status,
      planId: userWithCompany.company?.planId,
    });

    res.status(200).json({
      status: "success",
      token,
      message: "Contraseña restablecida correctamente.",
    });
  },
);
