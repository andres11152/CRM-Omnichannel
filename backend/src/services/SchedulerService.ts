import { availabilityRepository } from "@/repositories/AvailabilityRepository";
import { meetingTypeRepository } from "@/repositories/MeetingTypeRepository";
import { activityRepository } from "@/repositories/ActivityRepository";
import { userRepository } from "@/repositories/UserRepository";
import { contactRepository } from "@/repositories/ContactRepository";
import { companyRepository } from "@/repositories/CompanyRepository";
import { GoogleCalendarService } from "./GoogleCalendarService";
import { AppError } from "@/utils/AppError";
import { Logger } from "@/utils/logger";
import { Prisma } from "@prisma/client";

export interface BookingInput {
  companyId: string;
  meetingTypeSlug: string;
  agentSlugOrId: string;
  startTime: string; // ISO UTC String
  guestName: string;
  guestEmail: string;
  guestPhone?: string;
  guestNotes?: string;
}

export interface BookingResult {
  success: boolean;
  activityId: string;
  agentName: string | null;
  meetingName: string;
  startTime: Date;
}

export class SchedulerService {
  /**
   * Timezone Helper: Convert local YYYY-MM-DD and HH:MM to UTC Date in target timezone
   */
  private static localToUtc(dateStr: string, timeStr: string, timezone: string): Date {
    const [year, month, day] = dateStr.split("-").map(Number);
    const [hours, minutes] = timeStr.split(":").map(Number);
    
    const date = new Date(Date.UTC(year, month - 1, day, hours, minutes));
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
      hour12: false,
    });
    
    const parts = formatter.formatToParts(date);
    const partMap = new Map(parts.map(p => [p.type, p.value]));
    
    const targetYear = Number(partMap.get("year"));
    const targetMonth = Number(partMap.get("month"));
    const targetDay = Number(partMap.get("day"));
    const targetHour = Number(partMap.get("hour"));
    const targetMin = Number(partMap.get("minute"));
    
    const targetDate = new Date(Date.UTC(targetYear, targetMonth - 1, targetDay, targetHour, targetMin));
    const diffMs = targetDate.getTime() - date.getTime();
    
    return new Date(date.getTime() - diffMs);
  }

  /**
   * Get available slots for a given agent, meeting type, and date
   * @param dateStr YYYY-MM-DD (e.g. "2026-07-15")
   */
  static async getAvailableSlots(
    companyId: string,
    agentSlugOrId: string,
    meetingTypeSlug: string,
    dateStr: string
  ): Promise<string[]> {
    // 1. Resolve agent
    const agent = await userRepository.findFirst({
      where: {
        companyId,
        OR: [
          { id: agentSlugOrId },
          { email: agentSlugOrId }, // agentSlug can be email/id
        ],
      },
    });

    if (!agent) {
      throw new AppError("Agent not found", 404);
    }

    // 2. Resolve meeting type
    const meetingType = await meetingTypeRepository.findFirst({
      where: {
        companyId,
        userId: agent.id,
        slug: meetingTypeSlug,
        isActive: true,
      },
    });

    if (!meetingType) {
      throw new AppError("Meeting type not found", 404);
    }

    // 3. Resolve Availability settings
    const availability = await availabilityRepository.findFirst({
      where: {
        companyId,
        userId: agent.id,
      },
    });

    if (!availability) {
      // Default fallback availability: Mon-Fri 09:00 - 17:00
      Logger.info(`[Scheduler] Agent ${agent.id} has no explicit availability, using fallback Mon-Fri 9-5`);
    }

    const timezone = availability?.timezone || "America/Bogota";
    const rules = (availability?.rules as unknown as Array<{ day: number; slots: { start: string; end: string }[] }>) || [
      { day: 1, slots: [{ start: "09:00", end: "17:00" }] },
      { day: 2, slots: [{ start: "09:00", end: "17:00" }] },
      { day: 3, slots: [{ start: "09:00", end: "17:00" }] },
      { day: 4, slots: [{ start: "09:00", end: "17:00" }] },
      { day: 5, slots: [{ start: "09:00", end: "17:00" }] },
    ];

    // Determine day of week in target timezone
    // To do this reliably, we can parse the local date using UTC date methods
    const [year, month, day] = dateStr.split("-").map(Number);
    const targetDate = new Date(Date.UTC(year, month - 1, day));
    const dayOfWeek = targetDate.getUTCDay(); // 0 = Sunday, 1 = Monday, etc.

    const dailyRule = rules.find((r) => r.day === dayOfWeek);
    if (!dailyRule || !dailyRule.slots || dailyRule.slots.length === 0) {
      return []; // No availability rules for this day
    }

    // Generate potential slots in UTC
    const potentialSlots: { start: Date; end: Date }[] = [];
    const durationMs = meetingType.duration * 60 * 1000;

    for (const ruleSlot of dailyRule.slots) {
      const startUtc = this.localToUtc(dateStr, ruleSlot.start, timezone);
      const endUtc = this.localToUtc(dateStr, ruleSlot.end, timezone);

      let currentStart = startUtc;
      while (currentStart.getTime() + durationMs <= endUtc.getTime()) {
        const currentEnd = new Date(currentStart.getTime() + durationMs);
        
        // Exclude past slots
        if (currentStart.getTime() > Date.now()) {
          potentialSlots.push({ start: new Date(currentStart), end: currentEnd });
        }
        currentStart = new Date(currentStart.getTime() + durationMs);
      }
    }

    if (potentialSlots.length === 0) {
      return [];
    }

    // Determine date range for conflict checks
    const firstSlotStart = potentialSlots[0].start;
    const lastSlotEnd = potentialSlots[potentialSlots.length - 1].end;

    // 4. Fetch local conflicts (Activities of type MEETING, status PENDING or COMPLETED)
    const localConflicts = await activityRepository.findMany({
      where: {
        companyId,
        assignedToId: agent.id,
        type: "MEETING",
        status: { in: ["PENDING", "COMPLETED"] },
        dueDate: {
          gte: firstSlotStart,
          lte: lastSlotEnd,
        },
      },
    });

    // 5. Fetch Google Calendar conflicts
    const googleConflicts = await GoogleCalendarService.getBusySlots(
      agent.id,
      firstSlotStart,
      lastSlotEnd
    );

    // 6. Filter out busy slots
    const availableSlots = potentialSlots.filter((slot) => {
      // Check local overlap
      const hasLocalConflict = localConflicts.some((conflict) => {
        if (!conflict.dueDate) return false;
        const confStart = conflict.dueDate.getTime();
        // Assume meetings last for the duration of the meeting type that was booked
        const confEnd = confStart + durationMs; 
        
        return (
          (slot.start.getTime() >= confStart && slot.start.getTime() < confEnd) ||
          (slot.end.getTime() > confStart && slot.end.getTime() <= confEnd)
        );
      });

      if (hasLocalConflict) return false;

      // Check Google Calendar overlap
      const hasGoogleConflict = googleConflicts.some((busy) => {
        const busyStart = new Date(busy.start).getTime();
        const busyEnd = new Date(busy.end).getTime();

        return (
          (slot.start.getTime() >= busyStart && slot.start.getTime() < busyEnd) ||
          (slot.end.getTime() > busyStart && slot.end.getTime() <= busyEnd)
        );
      });

      return !hasGoogleConflict;
    });

    return availableSlots.map((slot) => slot.start.toISOString());
  }

  /**
   * Book a slot for a guest
   */
  static async bookSlot(input: BookingInput): Promise<BookingResult> {
    const { companyId, meetingTypeSlug, agentSlugOrId, startTime, guestName, guestEmail, guestPhone, guestNotes } = input;

    // 1. Resolve agent
    const agent = await userRepository.findFirst({
      where: {
        companyId,
        OR: [
          { id: agentSlugOrId },
          { email: agentSlugOrId },
        ],
      },
    });

    if (!agent) {
      throw new AppError("Agent not found", 404);
    }

    // 2. Resolve meeting type
    const meetingType = await meetingTypeRepository.findFirst({
      where: {
        companyId,
        userId: agent.id,
        slug: meetingTypeSlug,
        isActive: true,
      },
    });

    if (!meetingType) {
      throw new AppError("Meeting type not found", 404);
    }

    // 3. Upsert Contact in CRM
    let contact = await contactRepository.findFirst({
      where: {
        companyId,
        email: guestEmail,
      },
    });

    if (!contact) {
      contact = await contactRepository.createRaw({
        data: {
          companyId,
          name: guestName,
          email: guestEmail,
          phone: guestPhone || null,
          notes: "Created via Public Scheduler",
        },
      });
    }

    // 4. Create Activity in local CRM
    const start = new Date(startTime);
    const activity = await activityRepository.create({
      data: {
        companyId,
        type: "MEETING",
        subject: `📅 ${meetingType.name} - ${guestName}`,
        description: guestNotes || `Meeting booked via public link.\nGuest Email: ${guestEmail}\nGuest Phone: ${guestPhone || "N/A"}`,
        status: "PENDING",
        dueDate: start,
        assignedToId: agent.id,
        createdById: agent.id, // Booked on behalf of agent
        contactId: contact.id,
      },
    });

    // 5. Create Event in Google Calendar
    if (agent.googleCalendarRefreshToken) {
      try {
        const googleEventId = await GoogleCalendarService.createMeetingEvent(agent.id, {
          subject: activity.subject,
          description: activity.description || "",
          dueDate: start,
          participantIds: [agent.id], // Agent is a participant
        });

        if (googleEventId) {
          await activityRepository.update({
            where: { id: activity.id },
            data: { googleEventId },
          });
        }
      } catch (err) {
        Logger.error(`[Scheduler] Failed to sync booking with Google Calendar for agent ${agent.id}:`, err);
      }
    }

    return {
      success: true,
      activityId: activity.id,
      agentName: agent.name,
      meetingName: meetingType.name,
      startTime: activity.dueDate,
    };
  }

  /**
   * Get metadata info for a public booking page link
   */
  static async getMeetingTypeInfo(
    companySlug: string,
    agentSlug: string,
    meetingTypeSlug: string
  ) {
    let company = await companyRepository.findBySlug(companySlug);
    if (!company) {
      company = await companyRepository.findById(companySlug);
    }
    if (!company) {
      throw new AppError("Company not found", 404);
    }

    const agent = await userRepository.findFirst({
      where: {
        companyId: company.id,
        OR: [
          { id: agentSlug },
          { email: agentSlug },
        ],
      },
    });

    if (!agent) {
      throw new AppError("Agent not found", 404);
    }

    const meetingType = await meetingTypeRepository.findFirst({
      where: {
        companyId: company.id,
        userId: agent.id,
        slug: meetingTypeSlug,
        isActive: true,
      },
    });

    if (!meetingType) {
      throw new AppError("Meeting type not found", 404);
    }

    return {
      name: meetingType.name,
      description: meetingType.description,
      duration: meetingType.duration,
      agentName: agent.name || "Asesor",
      companyName: company.name,
      companyId: company.id,
      agentId: agent.id,
    };
  }
}
