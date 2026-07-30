import { Request, Response, NextFunction } from "express";
import { AuthenticatedRequest } from "@/types/types";
import { catchAsync } from "@/utils/catchAsync";
import { AppError } from "@/utils/AppError";
import jwt, { SignOptions } from "jsonwebtoken";
import crypto from "crypto";
import { Logger } from "@/utils/logger";
import { getEnv } from "@/config/env";
import { emailService } from "@/services/EmailService";
import { passwordResetEmail } from "@/utils/emailTemplates";
import { authCrudService } from "@/services/AuthCrudService";
import { sessionService, SESSION_TTL } from "@/services/SessionService";
import { auditService } from "@/services/AuditService";
import { TenantContextManager } from "@/config/tenantContext";
import {
  SignupSchema,
  LoginSchema,
  ForgotPasswordSchema,
  ResetPasswordSchema,
  UpdatePasswordSchema,
} from "@/schemas/authSchema";

export interface TokenPayload {
  id: string;
  role: string;
  email?: string;
  name?: string;
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

export const setAuthCookies = (
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

export const clearAuthCookies = (res: Response) => {
  res.clearCookie("access_token", { path: "/" });
  res.clearCookie("refresh_token", { path: "/api/auth" });
};

export const signup = catchAsync(
  async (req: Request, res: Response, _next: NextFunction) => {
    const parsed = SignupSchema.parse({ body: req.body });
    const { name, email, password, companyId } = parsed.body;

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
    const parsed = LoginSchema.parse({ body: req.body });
    const { email, password } = parsed.body;

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
      email: user.email,
      name: user.name,
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

    // [AUTH] Audit successful logins
    // [SEC] /login runs BEFORE `protect` establishes tenant context (there's no
    // session yet at this point) — auditRepository.createLog writes to a
    // tenant-scoped model, so without this wrapper every login silently threw
    // "SECURITY VIOLATION: Access to AuditLog denied" (swallowed inside
    // createLog's own try/catch, but the login was never actually audited).
    void TenantContextManager.run(
      { companyId: user.companyId, userId: user.id, requestId: `login:${user.id}` },
      () =>
        auditService.logAction({
          companyId: user.companyId,
          userId: user.id,
          action: "LOGIN",
          entity: "User",
          entityId: user.id,
          details: { email: user.email },
          ipAddress: String(ipAddress),
          userAgent: String(userAgent),
        }),
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

export const exitImpersonation = catchAsync(
  async (req: Request, res: Response) => {
    clearAuthCookies(res);
    res.status(200).json({
      status: "success",
      message: "Cookies de impersonación eliminadas correctamente.",
    });
  },
);

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

    if (req.user?.companyId) {
      void auditService.logAction({
        companyId: req.user.companyId,
        userId: req.user.id,
        action: "LOGOUT",
        entity: "User",
        entityId: req.user.id,
        details: { email: req.user.email },
        ipAddress: req.ip,
        userAgent: req.get("User-Agent"),
      });
    }

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
      email: user.email,
      name: user.name,
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

    const parsed = UpdatePasswordSchema.parse({ body: req.body });
    const { currentPassword, newPassword } = parsed.body;

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
    const parsed = ForgotPasswordSchema.parse({ body: req.body });
    const { email } = parsed.body;

    // Generic response — always returned regardless of whether email exists (prevents enumeration)
    const GENERIC_SUCCESS = {
      status: "success",
      message:
        "Si existe una cuenta con ese correo, recibirás un enlace de recuperación en los próximos minutos.",
    };

    let generateResult: {
      user: { id: string; email: string; name?: string | null; companyId: string | null };
      resetToken: string;
    } | null = null;

    const maskedEmail = `${email.substring(0, 3)}***@${email.split("@")[1] || "?"}`;

    try {
      generateResult = await authCrudService.generateResetToken(email);
    } catch (err) {
      // [SEC] Anti-enumeration: we always return the SAME generic response. BUT we must
      // distinguish a legitimately-missing account (expected, info-level) from a REAL
      // failure (DB down, token-gen bug). Swallowing real errors as "success" is exactly
      // what made this look broken with no trace. Real errors are logged loudly so they
      // surface in monitoring while the user still sees the generic message.
      const status = err instanceof AppError ? err.statusCode : 500;
      if (status === 404) {
        Logger.info(`[Auth] forgot-password: no account for ${maskedEmail} (silent, no email)`);
      } else {
        Logger.error(
          `[Auth] forgot-password: token generation FAILED for ${maskedEmail} (status ${status}):`,
          err instanceof Error ? err : new Error(String(err)),
        );
      }
      return res.status(200).json(GENERIC_SUCCESS);
    }

    const { user, resetToken } = generateResult;
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
    const resetUrl = `${frontendUrl}/reset-password/${resetToken}`;

    const { html, text } = passwordResetEmail({
      resetUrl,
      userName: user.name,
      expiryMinutes: 10,
      requestIp: req.ip || req.socket.remoteAddress || null,
      requestedAt: new Date(),
    });

    try {
      await emailService.sendEmail({
        to: user.email,
        subject: "Recupera tu contraseña · Sentry CRM",
        html,
        text,
      });
      Logger.info(
        `[Auth] ✅ Password reset email dispatched to ${maskedEmail} (userId: ${user.id})`,
      );
      return res.status(200).json(GENERIC_SUCCESS);
    } catch (error: unknown) {
      Logger.error(
        `[Auth] ❌ Failed to send password reset email to ${maskedEmail}:`,
        error instanceof Error ? error : new Error(String(error)),
      );
      await authCrudService.clearResetToken(user.id);
      return next(
        new AppError(
          "No se pudo enviar el correo de recuperación. Intenta de nuevo más tarde.",
          500,
        ),
      );
    }
  },
);

export const resetPassword = catchAsync(
  async (req: Request, res: Response, _next: NextFunction) => {
    const parsed = ResetPasswordSchema.parse({ body: req.body });
    const { password } = parsed.body;

    const user = await authCrudService.resetPasswordWithToken(
      req.params.token,
      password,
    );

    const userWithCompany = user as unknown as typeof user & {
      company?: { status: string; planId?: string };
    };

    // Create a proper server-side session (mirrors the login flow)
    const ipAddress = req.ip || req.socket.remoteAddress || "unknown";
    const userAgent = req.get("user-agent") || "unknown";

    const { sessionId, refreshToken } = await sessionService.createSession({
      userId: user.id,
      companyId: user.companyId,
      ip: ipAddress,
      userAgent,
    });

    const accessToken = signAccessToken({
      id: user.id,
      role: user.role,
      email: user.email,
      name: user.name,
      companyId: user.companyId,
      companyStatus: userWithCompany.company?.status,
      planId: userWithCompany.company?.planId,
      sessionId,
    });

    // Set HttpOnly cookies (XSS-proof) — consistent with login flow
    setAuthCookies(res, accessToken, refreshToken);

    res.status(200).json({
      status: "success",
      token: accessToken,
      message: "Contraseña restablecida correctamente.",
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
        },
      },
    });
  },
);
