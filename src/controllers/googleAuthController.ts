import { Request, Response } from "express";
import { google } from "googleapis";
import { prisma } from "@/config/prisma";
import { catchAsync } from "@/utils/catchAsync";
import { AuthenticatedRequest } from "@/types/types";

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  `${process.env.BACKEND_URL || "http://localhost:4000"}/api/google/callback`
);

// Scopes for Google Calendar
const SCOPES = ["https://www.googleapis.com/auth/calendar.events"];

export const googleAuthController = {
  /**
   * Initiate OAuth flow - redirect user to Google consent screen
   */
  initiateAuth: catchAsync(async (req: AuthenticatedRequest, res: Response) => {
    // Support both header auth and query param (for browser redirects)
    const userId = req.user?.id || (req.query.userId as string);

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized - No user ID" });
    }

    // Generate auth URL with state parameter (userId for callback identification)
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: "offline", // Get refresh token
      scope: SCOPES,
      state: userId, // Pass userId to identify user in callback
      prompt: "consent", // Force consent screen to always get refresh token
    });

    res.redirect(authUrl);
  }),

  /**
   * Handle OAuth callback - exchange code for tokens and store in DB
   */
  handleCallback: catchAsync(async (req: Request, res: Response) => {
    const { code, state } = req.query;
    const userId = state as string;

    if (!code || !userId) {
      return res.status(400).send("Missing code or state parameter");
    }

    try {
      // Exchange authorization code for tokens
      const { tokens } = await oauth2Client.getToken(code as string);

      // Store tokens in database
      await prisma.user.update({
        where: { id: userId },
        data: {
          googleCalendarToken: tokens.access_token || null,
          googleCalendarRefreshToken: tokens.refresh_token || null,
        },
      });

      // Redirect to frontend success page
      const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
      res.redirect(`${frontendUrl}/settings?calendar=connected`);
    } catch (error) {
      console.error("[GoogleAuth] Error exchanging code for tokens:", error);
      const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
      res.redirect(`${frontendUrl}/settings?calendar=error`);
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
