import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { AuthenticatedRequest } from "@/types/types";
import { OutlookCalendarService } from "@/services/OutlookCalendarService";
import { userRepository } from "@/repositories/UserRepository";
import { AppError } from "@/utils/AppError";

const STATE_SECRET =
  process.env.JWT_SECRET || process.env.SESSION_SECRET || "dev-state-secret";

class OutlookAuthController {
  /**
   * Return consent URL
   */
  getAuthUrl = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.query.userId as string;
      if (!userId) {
        return next(new AppError("User ID is required", 400));
      }
      
      const state = jwt.sign({ userId }, STATE_SECRET, {
        expiresIn: "10m",
      });

      const url = OutlookCalendarService.getAuthUrl(state);
      res.status(200).json({ status: "success", url });
    } catch (error) {
      next(error);
    }
  };

  /**
   * OAuth Callback
   */
  callback = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { code, state, error } = req.query;
      const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";

      if (error) {
        return res.redirect(`${frontendUrl}/settings?outlook=error`);
      }

      if (!code || typeof state !== "string") {
        return res.redirect(`${frontendUrl}/settings?outlook=error`);
      }

      // Verify and decode state JWT
      let userId: string;
      try {
        const decoded = jwt.verify(state, STATE_SECRET) as { userId: string };
        userId = decoded.userId;
      } catch (err) {
        return res.redirect(`${frontendUrl}/settings?outlook=error`);
      }

      const { accessToken, refreshToken } = await OutlookCalendarService.getTokensFromCode(code as string);

      const user = await userRepository.findFirst({
        where: { id: userId },
      });

      if (!user || !user.companyId) {
        return res.redirect(`${frontendUrl}/settings?outlook=error`);
      }

      await userRepository.update(user.id, user.companyId, {
        outlookCalendarToken: accessToken,
        outlookCalendarRefreshToken: refreshToken,
      });

      res.redirect(`${frontendUrl}/settings?outlook=connected`);
    } catch (err) {
      const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
      res.redirect(`${frontendUrl}/settings?outlook=error`);
    }
  };

  /**
   * Connection status
   */
  getStatus = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return next(new AppError("Unauthorized", 401));
      }

      const user = await userRepository.findFirst({
        where: { id: userId },
        select: { outlookCalendarRefreshToken: true },
      });

      res.status(200).json({
        status: "success",
        connected: !!user?.outlookCalendarRefreshToken,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Disconnect Outlook
   */
  disconnect = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.id;
      const companyId = req.user?.companyId;

      if (!userId || !companyId) {
        return next(new AppError("Unauthorized", 401));
      }

      await userRepository.update(userId, companyId, {
        outlookCalendarToken: null,
        outlookCalendarRefreshToken: null,
      });

      res.status(200).json({
        status: "success",
        message: "Outlook disconnected",
      });
    } catch (error) {
      next(error);
    }
  };
}

export const outlookAuthController = new OutlookAuthController();
