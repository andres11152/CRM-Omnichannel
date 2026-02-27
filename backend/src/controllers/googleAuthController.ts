import { Request, Response } from "express";
import { google } from "googleapis";
import { catchAsync } from "@/utils/catchAsync";
import { AuthenticatedRequest } from "@/types/types";
import { signToken } from "./authController";
import { Logger } from "@/utils/logger";
import { googleAuthCrudService } from "@/services/googleAuthCrudService";

// Environment Variables
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const BACKEND_URL = process.env.BACKEND_URL;
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";

if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !BACKEND_URL) {
  Logger.error(
    "❌ CRITICAL: Missing Google Auth Environment Variables (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, BACKEND_URL)",
  );
}

const oauth2Client = new google.auth.OAuth2(
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  `${BACKEND_URL}/api/google/callback`,
);

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
   */
  initiateAuth: catchAsync(async (req: AuthenticatedRequest, res: Response) => {
    const actionQuery = req.query.action;
    const action = typeof actionQuery === "string" ? actionQuery : "login";
    const userId = req.user?.id;

    let SCOPES = LOGIN_SCOPES;
    let stateData: StateData = { action: "login" };

    if (action === "calendar") {
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
      prompt: "consent",
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
      let stateData: StateData;
      try {
        stateData = JSON.parse(state);
      } catch {
        return res.redirect(`${FRONTEND_URL}/login?error=invalid_state`);
      }

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

        let user = await googleAuthCrudService.findUserByEmail(email);

        if (!user) {
          user = await googleAuthCrudService.createGoogleUser({
            email,
            name: name || "Google User",
            picture,
          });
        } else {
          if (!user.profilePicUrl && picture) {
            await googleAuthCrudService.updateProfilePic(user.id, picture);
          }
        }

        if (!user.companyId || !user.company) {
          return res.redirect(`${FRONTEND_URL}/login?error=no_company`);
        }

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
        const user = await googleAuthCrudService.saveCalendarTokens(
          stateData.userId,
          tokens.access_token || null,
          tokens.refresh_token || null,
        );

        if (!user) {
          return res.redirect(`${FRONTEND_URL}/settings?error=user_not_found`);
        }

        return res.redirect(`${FRONTEND_URL}/settings?calendar=connected`);
      }

      return res.redirect(`${FRONTEND_URL}/login?error=invalid_action`);
    } catch (error) {
      Logger.error("[GoogleAuth] Error:", error);
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

    await googleAuthCrudService.disconnectCalendar(userId);

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

    const isConnected = await googleAuthCrudService.getCalendarStatus(userId);

    res.status(200).json({ connected: isConnected });
  }),
};
