import { Request, Response } from "express";
import { google } from "googleapis";
import bcrypt from "bcryptjs";
import { prisma } from "@/config/database";
import { catchAsync } from "@/utils/catchAsync";
import { AuthenticatedRequest } from "@/types/types";
import { signToken } from "./authController";

// Environment Variables Check
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const BACKEND_URL = process.env.BACKEND_URL;
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";

// Fail fast or warn if critical config is missing
if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !BACKEND_URL) {
  console.error(
    "❌ CRITICAL: Missing Google Auth Environment Variables (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, BACKEND_URL)",
  );
}

const oauth2Client = new google.auth.OAuth2(
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  `${BACKEND_URL}/api/google/callback`,
);

// Scopes
const CALENDAR_SCOPES = ["https://www.googleapis.com/auth/calendar.events"];
const LOGIN_SCOPES = [
  "https://www.googleapis.com/auth/userinfo.profile",
  "https://www.googleapis.com/auth/userinfo.email",
];

interface StateData {
  action: "login" | "calendar";
  userId?: string;
}

export const googleAuthController = {
  /**
   * Initiate OAuth flow
   * Action: 'login' | 'calendar'
   * Security: 'calendar' requires authenticated session.
   */
  initiateAuth: catchAsync(async (req: AuthenticatedRequest, res: Response) => {
    const actionQuery = req.query.action;
    const action = typeof actionQuery === "string" ? actionQuery : "login";
    const userId = req.user?.id;

    let SCOPES = LOGIN_SCOPES;
    let stateData: StateData = { action: "login" };

    if (action === "calendar") {
      // 🛡️ SECURITY: Calendar connection REQUIRES authenticated session
      if (!userId) {
        return res.status(401).json({
          message:
            "Unauthorized - You must be logged in to connect Google Calendar.",
        });
      }
      SCOPES = CALENDAR_SCOPES;
      stateData = { action: "calendar", userId };
    }

    const authUrl = oauth2Client.generateAuthUrl({
      access_type: "offline",
      scope: SCOPES,
      state: JSON.stringify(stateData),
      prompt: "consent", // Force consent to ensure refresh token is returned
    });

    res.redirect(authUrl);
  }),

  /**
   * Handle OAuth callback
   */
  handleCallback: catchAsync(async (req: Request, res: Response) => {
    const { code, state } = req.query;

    if (typeof code !== "string" || typeof state !== "string") {
      return res.redirect(`${FRONTEND_URL}/login?error=missing_params`);
    }

    try {
      // Decode state
      let stateData: StateData;
      try {
        stateData = JSON.parse(state);
      } catch {
        return res.redirect(`${FRONTEND_URL}/login?error=invalid_state`);
      }

      // Exchange code for tokens
      const { tokens } = await oauth2Client.getToken(code);
      oauth2Client.setCredentials(tokens);

      // === FLOW: LOGIN ===
      if (stateData.action === "login") {
        const oauth2 = google.oauth2({ version: "v2", auth: oauth2Client });
        const userInfo = await oauth2.userinfo.get();
        const { email, name, picture } = userInfo.data;

        if (!email) {
          return res.redirect(`${FRONTEND_URL}/login?error=no_email`);
        }

        // Find or Create User (Transactional with Company)
        let user = await prisma.user.findUnique({
          where: { email },
          include: { company: true },
        });

        if (!user) {
          // New User: Create User + Company (Trial)
          // 🛡️ 100-YEAR SOLUTION: Every user belongs to a Tenant (Company).
          const randomPassword =
            Math.random().toString(36).slice(-8) +
            Math.random().toString(36).slice(-8);
          const hashedPassword = await bcrypt.hash(randomPassword, 12);

          user = await prisma.user.create({
            data: {
              email,
              name: name || "Google User",
              password: hashedPassword,
              profilePicUrl: picture || null,
              role: "ADMIN",
              preferences: { googleAuth: true },
              company: {
                create: {
                  name: `${name || "User"}'s Workspace`,
                  status: "TRIAL",
                  emailProvider: "SMTP", // Explicit default
                },
              },
            },
            include: { company: true },
          });
        } else {
          // Existing User: Update ID if missing
          if (!user.profilePicUrl && picture) {
            // Update profile pic asynchronously/independently of company logic
            await prisma.user.update({
              where: { id: user.id },
              data: { profilePicUrl: picture },
            });
          }
        }

        // Integrity check
        if (!user.companyId || !user.company) {
          return res.redirect(`${FRONTEND_URL}/login?error=no_company`);
        }

        // Generate JWT
        const token = signToken({
          id: user.id,
          role: user.role,
          companyId: user.companyId,
          companyStatus: user.company.status,
          planId: user.company.planId || undefined,
        });

        return res.redirect(`${FRONTEND_URL}/login?token=${token}`);
      }

      // === FLOW: CALENDAR ===
      if (stateData.action === "calendar" && stateData.userId) {
        // Verify user exists
        const user = await prisma.user.findUnique({
          where: { id: stateData.userId },
        });
        if (!user) {
          return res.redirect(`${FRONTEND_URL}/settings?error=user_not_found`);
        }

        await prisma.user.update({
          where: { id: stateData.userId },
          data: {
            googleCalendarToken: tokens.access_token || null,
            googleCalendarRefreshToken: tokens.refresh_token || null,
          },
        });
        return res.redirect(`${FRONTEND_URL}/settings?calendar=connected`);
      }

      return res.redirect(`${FRONTEND_URL}/login?error=invalid_action`);
    } catch (error) {
      console.error("[GoogleAuth] Error:", error);
      res.redirect(`${FRONTEND_URL}/login?error=auth_failed`);
    }
  }),

  /**
   * Disconnect Google Calendar
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
