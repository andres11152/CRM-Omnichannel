import { google, calendar_v3 } from "googleapis";
import { prisma } from "../config/prisma";
import { Logger } from "../utils/logger";

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  `${process.env.BACKEND_URL || "http://localhost:4000"}/api/google/callback`
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

    // Fetch users (participants)
    const participants = await prisma.user.findMany({
      where: { id: { in: ids } },
      select: { email: true },
    });

    // Filter valid emails
    return participants
      .map((p) => p.email)
      .filter((email) => email && email.includes("@"));
  }

  /**
   * Create a calendar event for a meeting activity
   */
  static async createMeetingEvent(
    userId: string,
    activity: ActivityData
  ): Promise<string | null> {
    try {
      // 1. Fetch user's Google tokens
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          googleCalendarToken: true,
          googleCalendarRefreshToken: true,
          email: true,
        },
      });

      if (!user?.googleCalendarRefreshToken) {
        Logger.info(
          `[GoogleCalendar] User ${userId} has no Google Calendar connection`
        );
        return null; // Silently skip if not connected
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
        activity.participantIds || []
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
            activity.dueDate.getTime() + 60 * 60 * 1000
          ).toISOString(), // +1 hour
          timeZone: "America/Bogota",
        },
        attendees, // Add attendees
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
        conferenceDataVersion: 1, // Crucial for creating Meet link
      });

      Logger.info(`[GoogleCalendar] Event created: ${response.data.htmlLink}`);

      // 6. If token was refreshed, update it in DB
      const newAccessToken = oauth2Client.credentials.access_token;
      if (newAccessToken && newAccessToken !== user.googleCalendarToken) {
        await prisma.user.update({
          where: { id: userId },
          data: { googleCalendarToken: newAccessToken },
        });
      }

      return response.data.id || null;
    } catch (error: any) {
      Logger.error(`[GoogleCalendar] Failed to create event:`, error.message);

      // If token is invalid, clear it from DB
      if (
        error.message?.includes("invalid_grant") ||
        error.message?.includes("Token has been expired")
      ) {
        await prisma.user.update({
          where: { id: userId },
          data: {
            googleCalendarToken: null,
            googleCalendarRefreshToken: null,
          },
        });
        Logger.warn(
          `[GoogleCalendar] Cleared invalid tokens for user ${userId}`
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
    eventId: string
  ): Promise<void> {
    try {
      // 1. Fetch user's Google tokens
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          googleCalendarToken: true,
          googleCalendarRefreshToken: true,
        },
      });

      if (!user?.googleCalendarRefreshToken) return;

      // 2. Set credentials
      oauth2Client.setCredentials({
        access_token: user.googleCalendarToken,
        refresh_token: user.googleCalendarRefreshToken,
      });

      // 3. Initialize Calendar API
      const calendar = google.calendar({ version: "v3", auth: oauth2Client });

      // 4. Delete event
      await calendar.events.delete({
        calendarId: "primary",
        eventId: eventId,
      });

      Logger.info(`[GoogleCalendar] Event deleted: ${eventId}`);
    } catch (error: any) {
      Logger.error(`[GoogleCalendar] Failed to delete event:`, error.message);
    }
  }

  /**
   * Update a calendar event
   */
  static async updateMeetingEvent(
    userId: string,
    eventId: string,
    activity: ActivityData
  ): Promise<void> {
    try {
      // 1. Fetch user's Google tokens
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          googleCalendarToken: true,
          googleCalendarRefreshToken: true,
        },
      });

      if (!user?.googleCalendarRefreshToken) return;

      // 2. Set credentials
      oauth2Client.setCredentials({
        access_token: user.googleCalendarToken,
        refresh_token: user.googleCalendarRefreshToken,
      });

      // 3. Initialize Calendar API
      const calendar = google.calendar({ version: "v3", auth: oauth2Client });

      // Get attendees emails
      const attendeeEmails = await this.getParticipantEmails(
        activity.participantIds || []
      );
      const attendees = attendeeEmails.map((email) => ({ email }));

      // 4. Prepare event data (similar to create)
      const event: calendar_v3.Schema$Event = {
        summary: activity.subject,
        description: activity.description || "Updated from CRM",
        start: {
          dateTime: activity.dueDate.toISOString(),
          timeZone: "America/Bogota",
        },
        end: {
          dateTime: new Date(
            activity.dueDate.getTime() + 60 * 60 * 1000
          ).toISOString(), // +1 hour
          timeZone: "America/Bogota",
        },
        attendees, // Update attendees
      };

      // 5. Update event
      await calendar.events.patch({
        calendarId: "primary",
        eventId: eventId,
        requestBody: event,
      });

      Logger.info(`[GoogleCalendar] Event updated: ${eventId}`);
    } catch (error: any) {
      Logger.error(`[GoogleCalendar] Failed to update event:`, error.message);
    }
  }
}
