import { Request, Response } from "express";
import { google } from "googleapis";
import { prisma } from "@/config/database";
import { catchAsync } from "@/utils/catchAsync";
import { AuthenticatedRequest } from "@/types/types";
import { signToken } from "./authController"; // Import token signer

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  `${process.env.BACKEND_URL || "http://localhost:4000"}/api/google/callback`
);

// Scopes
const CALENDAR_SCOPES = ["https://www.googleapis.com/auth/calendar.events"];
const LOGIN_SCOPES = [
  "https://www.googleapis.com/auth/userinfo.profile",
  "https://www.googleapis.com/auth/userinfo.email",
];

export const googleAuthController = {
  /**
   * Initiate OAuth flow
   * Query params:
   * - action: 'login' | 'calendar' (default: 'calendar' if userId present)
   * - userId: required only for 'calendar'
   */
  initiateAuth: catchAsync(async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user?.id || (req.query.userId as string);
    const action =
      (req.query.action as string) || (userId ? "calendar" : "login");

    let SCOPES = CALENDAR_SCOPES;
    let state = "";

    if (action === "calendar") {
      if (!userId) {
        return res
          .status(401)
          .json({ message: "Unauthorized - No user ID for calendar sync" });
      }
      SCOPES = CALENDAR_SCOPES;
      state = JSON.stringify({ action: "calendar", userId });
    } else {
      // Login Flow
      SCOPES = LOGIN_SCOPES;
      state = JSON.stringify({ action: "login" });
    }

    const authUrl = oauth2Client.generateAuthUrl({
      access_type: "offline",
      scope: SCOPES,
      state: state, // JSON state to identify flow in callback
      prompt: "consent",
    });

    res.redirect(authUrl);
  }),

  /**
   * Handle OAuth callback
   */
  handleCallback: catchAsync(async (req: Request, res: Response) => {
    const { code, state } = req.query;

    if (!code || !state) {
      return res.status(400).send("Missing code or state parameter");
    }

    try {
      // Decode state
      let stateData: { action: string; userId?: string };
      try {
        // Backward compatibility check (if state is just userId string)
        if ((state as string).startsWith("{")) {
          stateData = JSON.parse(state as string);
        } else {
          stateData = { action: "calendar", userId: state as string };
        }
      } catch (e) {
        // Fallback
        stateData = { action: "calendar", userId: state as string };
      }

      // Exchange code for tokens
      const { tokens } = await oauth2Client.getToken(code as string);
      oauth2Client.setCredentials(tokens); // Set for this request instance

      const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";

      // === FLOW: LOGIN ===
      if (stateData.action === "login") {
        const oauth2 = google.oauth2({ version: "v2", auth: oauth2Client });
        const userInfo = await oauth2.userinfo.get();

        const { email, name, picture, id: googleId } = userInfo.data;

        if (!email) {
          return res.redirect(`${frontendUrl}/login?error=no_email`);
        }

        // Find or Create User
        let user = await prisma.user.findUnique({ where: { email } });

        if (!user) {
          // Create new user
          // Password fallback? Random password?
          // Or set a flag 'isGoogleAuth: true' so they can't login with password unless they set one?
          // For now, random strong password.
          const randomPassword =
            Math.random().toString(36).slice(-8) +
            Math.random().toString(36).slice(-8);
          const bcrypt = require("bcryptjs");
          const hashedPassword = await bcrypt.hash(randomPassword, 12);

          user = await prisma.user.create({
            data: {
              email,
              name: name || "Google User",
              password: hashedPassword,
              profilePicUrl: picture || null,
              role: "ADMIN", // Default role for new signups via Google? Or 'AGENT'? Safer 'company_admin' for SaaS trial?
              // Assuming new signup = SaaS Trial
              preferences: { googleAuth: true },
            },
          });
        } else {
          // Update pic if missing?
          if (!user.profilePicUrl && picture) {
            await prisma.user.update({
              where: { id: user.id },
              data: { profilePicUrl: picture },
            });
          }
        }

        // Generate JWT
        const token = signToken({
          id: user.id,
          role: user.role,
          companyId: user.companyId,
          // @ts-ignore
          companyStatus: user.company?.status,
          // @ts-ignore
          planId: user.company?.planId,
        });

        // Redirect to Frontend with Token
        // Security Note: Passing token in URL fragment/query is risky but standard for this flow (fragment is better).
        // We'll use a temporary code logic or just token in URL for specific route which frontend handles immediately and clears history.
        // Or set a cookie? JWT in cookie is better but cross-origin implies issues if locally developing.
        // Let's use simple query param to specific 'auth-callback' page.
        return res.redirect(`${frontendUrl}/login?token=${token}`);
      }

      // === FLOW: CALENDAR ===
      if (stateData.action === "calendar" && stateData.userId) {
        await prisma.user.update({
          where: { id: stateData.userId },
          data: {
            googleCalendarToken: tokens.access_token || null,
            googleCalendarRefreshToken: tokens.refresh_token || null,
          },
        });
        return res.redirect(`${frontendUrl}/settings?calendar=connected`);
      }

      return res.redirect(`${frontendUrl}/login?error=invalid_action`);
    } catch (error) {
      console.error("[GoogleAuth] Error:", error);
      const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
      res.redirect(`${frontendUrl}/settings?error=auth_failed`);
    }
  }),

  /**
   * Disconnect Google Calendar - remove tokens from DB
   */
  disconnect: catchAsync(async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    await prisma.user.update({
      where: { id: userId },
      data: {
        googleCalendarToken: null,
        googleCalendarRefreshToken: null,
      },
    });

    res
      .status(200)
      .json({ message: "Google Calendar disconnected successfully" });
  }),

  /**
   * Check connection status
   */
  status: catchAsync(async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        googleCalendarToken: true,
        googleCalendarRefreshToken: true,
      },
    });

    const isConnected = !!(
      user?.googleCalendarToken || user?.googleCalendarRefreshToken
    );

    res.status(200).json({ connected: isConnected });
  }),
};
