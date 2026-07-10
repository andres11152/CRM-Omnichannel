import axios from "axios";
import { Logger } from "../utils/logger";
import { getErrorMessage } from "../utils/errorHelpers";
import { userRepository } from "@/repositories/UserRepository";

interface ActivityData {
  subject: string;
  description?: string;
  dueDate: Date;
  assignedToId?: string;
  participantIds?: string[];
}

export class OutlookCalendarService {
  private static clientId = process.env.MICROSOFT_CLIENT_ID || "";
  private static clientSecret = process.env.MICROSOFT_CLIENT_SECRET || "";
  private static redirectUri = `${
    process.env.BACKEND_URL || "http://localhost:4000"
  }/api/outlook/callback`;

  /**
   * Helper to get participant emails
   */
  private static async getParticipantEmails(ids: string[]): Promise<string[]> {
    if (!ids || ids.length === 0) return [];
    const participants = await userRepository.findMany({
      where: { id: { in: ids } },
      select: { email: true },
    });
    return participants
      .map((p) => p.email)
      .filter((email) => email && email.includes("@"));
  }

  /**
   * Build consent URL
   */
  static getAuthUrl(userId: string): string {
    const scopes = ["offline_access", "User.Read", "Calendars.ReadWrite"];
    const params = new URLSearchParams({
      client_id: this.clientId,
      response_type: "code",
      redirect_uri: this.redirectUri,
      response_mode: "query",
      scope: scopes.join(" "),
      state: userId,
    });
    return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params.toString()}`;
  }

  /**
   * Exchange code for tokens
   */
  static async getTokensFromCode(code: string): Promise<{ accessToken: string; refreshToken: string }> {
    const params = new URLSearchParams({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      code,
      redirect_uri: this.redirectUri,
      grant_type: "authorization_code",
    });

    const res = await axios.post(
      "https://login.microsoftonline.com/common/oauth2/v2.0/token",
      params.toString(),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );

    return {
      accessToken: res.data.access_token,
      refreshToken: res.data.refresh_token,
    };
  }

  /**
   * Refresh outlook access token
   */
  private static async refreshAccessToken(
    userId: string,
    companyId: string,
    refreshToken: string
  ): Promise<string | null> {
    try {
      const params = new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      });

      const res = await axios.post(
        "https://login.microsoftonline.com/common/oauth2/v2.0/token",
        params.toString(),
        { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
      );

      const newAccessToken = res.data.access_token;
      const newRefreshToken = res.data.refresh_token;

      await userRepository.update(userId, companyId, {
        outlookCalendarToken: newAccessToken,
        ...(newRefreshToken && { outlookCalendarRefreshToken: newRefreshToken }),
      });

      return newAccessToken;
    } catch (error) {
      Logger.error(`[OutlookCalendar] Failed to refresh token for user ${userId}:`, getErrorMessage(error));
      return null;
    }
  }

  /**
   * Fetch busy slots for a given date range using Microsoft Graph calendarView
   */
  static async getBusySlots(
    userId: string,
    timeMin: Date,
    timeMax: Date
  ): Promise<{ start: string; end: string }[]> {
    let user;
    try {
      user = await userRepository.findFirst({
        where: { id: userId },
        select: {
          id: true,
          companyId: true,
          outlookCalendarToken: true,
          outlookCalendarRefreshToken: true,
        },
      });

      if (!user?.outlookCalendarRefreshToken) {
        return [];
      }

      let token = user.outlookCalendarToken;
      if (!token) {
        token = await this.refreshAccessToken(userId, user.companyId || "", user.outlookCalendarRefreshToken);
      }

      if (!token) return [];

      // Fetch events using calendarView
      let response;
      try {
        response = await axios.get(
          "https://graph.microsoft.com/v1.0/me/calendarView",
          {
            headers: { Authorization: `Bearer ${token}` },
            params: {
              startDateTime: timeMin.toISOString(),
              endDateTime: timeMax.toISOString(),
              $select: "start,end,showAs",
            },
          }
        );
      } catch (err: any) {
        if (err.response?.status === 401 && user.companyId) {
          // Token expired, refresh and retry once
          token = await this.refreshAccessToken(userId, user.companyId, user.outlookCalendarRefreshToken);
          if (token) {
            response = await axios.get(
              "https://graph.microsoft.com/v1.0/me/calendarView",
              {
                headers: { Authorization: `Bearer ${token}` },
                params: {
                  startDateTime: timeMin.toISOString(),
                  endDateTime: timeMax.toISOString(),
                  $select: "start,end,showAs",
                },
              }
            );
          }
        }
        if (!response) throw err;
      }

      const events = response.data.value || [];
      return events
        .filter((e: any) => e.showAs === "busy" || e.showAs === "oof")
        .map((e: any) => ({
          start: e.start?.dateTime ? `${e.start.dateTime}Z` : "",
          end: e.end?.dateTime ? `${e.end.dateTime}Z` : "",
        }))
        .filter((b: any) => b.start && b.end);
    } catch (error: unknown) {
      Logger.error(`[OutlookCalendar] Failed to fetch busy slots:`, getErrorMessage(error));
      return [];
    }
  }

  /**
   * Create an event in Outlook
   */
  static async createMeetingEvent(
    userId: string,
    activity: ActivityData
  ): Promise<string | null> {
    let user;
    try {
      user = await userRepository.findFirst({
        where: { id: userId },
        select: {
          id: true,
          companyId: true,
          outlookCalendarToken: true,
          outlookCalendarRefreshToken: true,
        },
      });

      if (!user?.outlookCalendarRefreshToken) {
        return null;
      }

      let token = user.outlookCalendarToken;
      if (!token) {
        token = await this.refreshAccessToken(userId, user.companyId || "", user.outlookCalendarRefreshToken);
      }

      if (!token) return null;

      const guestEmails = await this.getParticipantEmails(activity.participantIds || []);
      const attendees = guestEmails.map((email) => ({
        emailAddress: { address: email },
        type: "required",
      }));

      const payload = {
        subject: activity.subject,
        body: {
          contentType: "HTML",
          content: activity.description || "Agendado desde CRM",
        },
        start: {
          dateTime: activity.dueDate.toISOString(),
          timeZone: "UTC",
        },
        end: {
          dateTime: new Date(activity.dueDate.getTime() + 60 * 60 * 1000).toISOString(),
          timeZone: "UTC",
        },
        attendees,
        isOnlineMeeting: true,
        onlineMeetingProvider: "teamsForBusiness",
      };

      let response;
      try {
        response = await axios.post(
          "https://graph.microsoft.com/v1.0/me/events",
          payload,
          { headers: { Authorization: `Bearer ${token}` } }
        );
      } catch (err: any) {
        if (err.response?.status === 401 && user.companyId) {
          token = await this.refreshAccessToken(userId, user.companyId, user.outlookCalendarRefreshToken);
          if (token) {
            response = await axios.post(
              "https://graph.microsoft.com/v1.0/me/events",
              payload,
              { headers: { Authorization: `Bearer ${token}` } }
            );
          }
        }
        if (!response) throw err;
      }

      return response.data.id || null;
    } catch (error: unknown) {
      Logger.error(`[OutlookCalendar] Failed to create event:`, getErrorMessage(error));
      return null;
    }
  }

  /**
   * Delete an event from Outlook
   */
  static async deleteMeetingEvent(
    userId: string,
    eventId: string
  ): Promise<void> {
    try {
      const user = await userRepository.findFirst({
        where: { id: userId },
        select: {
          companyId: true,
          outlookCalendarToken: true,
          outlookCalendarRefreshToken: true,
        },
      });

      if (!user?.outlookCalendarRefreshToken) return;

      let token = user.outlookCalendarToken;
      if (!token) {
        token = await this.refreshAccessToken(userId, user.companyId || "", user.outlookCalendarRefreshToken);
      }

      if (!token) return;

      try {
        await axios.delete(
          `https://graph.microsoft.com/v1.0/me/events/${eventId}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
      } catch (err: any) {
        if (err.response?.status === 401 && user.companyId) {
          token = await this.refreshAccessToken(userId, user.companyId, user.outlookCalendarRefreshToken);
          if (token) {
            await axios.delete(
              `https://graph.microsoft.com/v1.0/me/events/${eventId}`,
              { headers: { Authorization: `Bearer ${token}` } }
            );
          }
        } else {
          throw err;
        }
      }
    } catch (error: unknown) {
      Logger.error(`[OutlookCalendar] Failed to delete event:`, getErrorMessage(error));
    }
  }
}
