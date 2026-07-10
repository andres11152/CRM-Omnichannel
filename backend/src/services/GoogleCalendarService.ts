/**
 * [DATE] GOOGLE CALENDAR SERVICE (Refactored — ORM-Free)
 *
 * Google Calendar API integration for meeting activities:
 * - Create calendar events with Google Meet links
 * - Delete/update calendar events
 * - Auto-refresh OAuth tokens
 *
 * All data access delegated to UserRepository.
 */

import { google, calendar_v3 } from "googleapis";
import { Logger } from "../utils/logger";
import { getErrorMessage } from "../utils/errorHelpers";
import { userRepository } from "@/repositories/UserRepository";

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  `${process.env.BACKEND_URL || "http://localhost:4000"}/api/google/callback`,
);

interface ActivityData {
  subject: string;
  description?: string;
  dueDate: Date;
  assignedToId?: string;
  participantIds?: string[];
}

export class GoogleCalendarService {
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
   * Create a calendar event for a meeting activity
   */
  static async createMeetingEvent(
    userId: string,
    activity: ActivityData,
  ): Promise<string | null> {
    let user;
    try {
      // 1. Fetch user's Google tokens via repository
      user = await userRepository.findFirst({
        where: { id: userId },
        select: {
          id: true,
          companyId: true,
          googleCalendarToken: true,
          googleCalendarRefreshToken: true,
          email: true,
        },
      });

      if (!user?.googleCalendarRefreshToken) {
        Logger.info(
          `[GoogleCalendar] User ${userId} has no Google Calendar connection`,
        );
        return null;
      }

      // 2. Set credentials
      oauth2Client.setCredentials({
        access_token: user.googleCalendarToken,
        refresh_token: user.googleCalendarRefreshToken,
      });

      // 3. Initialize Calendar API
      const calendar = google.calendar({ version: "v3", auth: oauth2Client });

      // Get attendees emails
      const attendeeEmails = await this.getParticipantEmails(
        activity.participantIds || [],
      );
      const attendees = attendeeEmails.map((email) => ({ email }));

      // 4. Prepare event data with Google Meet support
      const event: calendar_v3.Schema$Event = {
        summary: activity.subject,
        description: activity.description || "Created from CRM",
        start: {
          dateTime: activity.dueDate.toISOString(),
          timeZone: "America/Bogota",
        },
        end: {
          dateTime: new Date(
            activity.dueDate.getTime() + 60 * 60 * 1000,
          ).toISOString(),
          timeZone: "America/Bogota",
        },
        attendees,
        conferenceData: {
          createRequest: {
            requestId: `meeting-${Date.now()}`,
            conferenceSolutionKey: {
              type: "hangoutsMeet",
            },
          },
        },
        reminders: {
          useDefault: false,
          overrides: [
            { method: "email", minutes: 24 * 60 },
            { method: "popup", minutes: 30 },
          ],
        },
      };

      // 5. Create event
      const response = await calendar.events.insert({
        calendarId: "primary",
        requestBody: event,
        conferenceDataVersion: 1,
      });

      Logger.info(`[GoogleCalendar] Event created: ${response.data.htmlLink}`);

      // 6. If token was refreshed, update it via repository
      const newAccessToken = oauth2Client.credentials.access_token;
      if (
        newAccessToken &&
        newAccessToken !== user.googleCalendarToken &&
        user.companyId
      ) {
        await userRepository.update(userId, user.companyId, {
          googleCalendarToken: newAccessToken,
        });
      }

      return response.data.id || null;
    } catch (error: unknown) {
      const msg = getErrorMessage(error);
      Logger.error(`[GoogleCalendar] Failed to create event:`, msg);

      // If token is invalid, clear it via repository
      if (
        (msg.includes("invalid_grant") ||
          msg.includes("Token has been expired")) &&
        user?.companyId
      ) {
        await userRepository.update(userId, user.companyId, {
          googleCalendarToken: null,
          googleCalendarRefreshToken: null,
        });
        Logger.warn(
          `[GoogleCalendar] Cleared invalid tokens for user ${userId}`,
        );
      }
      return null;
    }
  }

  /**
   * Delete a calendar event
   */
  static async deleteMeetingEvent(
    userId: string,
    eventId: string,
  ): Promise<void> {
    try {
      const user = await userRepository.findFirst({
        where: { id: userId },
        select: {
          googleCalendarToken: true,
          googleCalendarRefreshToken: true,
        },
      });

      if (!user?.googleCalendarRefreshToken) return;

      oauth2Client.setCredentials({
        access_token: user.googleCalendarToken,
        refresh_token: user.googleCalendarRefreshToken,
      });

      const calendar = google.calendar({ version: "v3", auth: oauth2Client });

      await calendar.events.delete({
        calendarId: "primary",
        eventId: eventId,
      });

      Logger.info(`[GoogleCalendar] Event deleted: ${eventId}`);
    } catch (error: unknown) {
      Logger.error(
        `[GoogleCalendar] Failed to delete event:`,
        getErrorMessage(error),
      );
    }
  }

  /**
   * Update a calendar event
   */
  static async updateMeetingEvent(
    userId: string,
    eventId: string,
    activity: ActivityData,
  ): Promise<void> {
    try {
      const user = await userRepository.findFirst({
        where: { id: userId },
        select: {
          googleCalendarToken: true,
          googleCalendarRefreshToken: true,
        },
      });

      if (!user?.googleCalendarRefreshToken) return;

      oauth2Client.setCredentials({
        access_token: user.googleCalendarToken,
        refresh_token: user.googleCalendarRefreshToken,
      });

      const calendar = google.calendar({ version: "v3", auth: oauth2Client });

      const attendeeEmails = await this.getParticipantEmails(
        activity.participantIds || [],
      );
      const attendees = attendeeEmails.map((email) => ({ email }));

      const event: calendar_v3.Schema$Event = {
        summary: activity.subject,
        description: activity.description || "Updated from CRM",
        start: {
          dateTime: activity.dueDate.toISOString(),
          timeZone: "America/Bogota",
        },
        end: {
          dateTime: new Date(
            activity.dueDate.getTime() + 60 * 60 * 1000,
          ).toISOString(),
          timeZone: "America/Bogota",
        },
        attendees,
      };

      await calendar.events.patch({
        calendarId: "primary",
        eventId: eventId,
        requestBody: event,
      });

      Logger.info(`[GoogleCalendar] Event updated: ${eventId}`);
    } catch (error: unknown) {
      Logger.error(
        `[GoogleCalendar] Failed to update event:`,
        getErrorMessage(error),
      );
    }
  }

  /**
   * Fetch busy slots for a given date range
   */
  static async getBusySlots(
    userId: string,
    timeMin: Date,
    timeMax: Date,
  ): Promise<{ start: string; end: string }[]> {
    let user;
    try {
      user = await userRepository.findFirst({
        where: { id: userId },
        select: {
          id: true,
          companyId: true,
          googleCalendarToken: true,
          googleCalendarRefreshToken: true,
        },
      });

      if (!user?.googleCalendarRefreshToken) {
        return [];
      }

      oauth2Client.setCredentials({
        access_token: user.googleCalendarToken,
        refresh_token: user.googleCalendarRefreshToken,
      });

      const calendar = google.calendar({ version: "v3", auth: oauth2Client });

      const response = await calendar.freebusy.query({
        requestBody: {
          timeMin: timeMin.toISOString(),
          timeMax: timeMax.toISOString(),
          items: [{ id: "primary" }],
        },
      });

      // If token was refreshed, update it
      const newAccessToken = oauth2Client.credentials.access_token;
      if (
        newAccessToken &&
        newAccessToken !== user.googleCalendarToken &&
        user.companyId
      ) {
        await userRepository.update(userId, user.companyId, {
          googleCalendarToken: newAccessToken,
        });
      }

      const busy = response.data.calendars?.primary?.busy || [];
      return busy
        .map((b) => ({
          start: b.start || "",
          end: b.end || "",
        }))
        .filter((b) => b.start && b.end);
    } catch (error: unknown) {
      Logger.error(`[GoogleCalendar] Failed to fetch busy slots:`, getErrorMessage(error));
      return [];
    }
  }
}
