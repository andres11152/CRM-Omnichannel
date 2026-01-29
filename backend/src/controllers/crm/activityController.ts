import { Response, NextFunction } from "express";
import { AppError } from "../../utils/AppError";
import { catchAsync } from "../../utils/catchAsync";
import { AuthenticatedRequest } from "../../types";
import { prisma } from "../../config/database";
import { GoogleCalendarService } from "../../services/googleCalendarService";
import { mentionService } from "../../services/mentionService";

const resolveContactId = async (id: string, companyId: string) => {
  if (!id) return undefined;

  // 1. Check if it's already a Contact (by ID)
  // We wrap this in a try-catch because if ID is invalid format for database driver, it might throw
  try {
    const contact = await prisma.contact.findUnique({ where: { id } });
    if (contact) return id;
  } catch (e) {
    // Ignore error if ID format is invalid (e.g. too long for column, though CUID is string)
  }

  // 2. Check if it looks like a phone number (JID or raw number)
  // This is crucial for when the frontend passes a JID (e.g. from a fresh socket message)
  // instead of a resolved CUID.
  const cleanPhone = id.replace("@c.us", "").replace("@g.us", "");
  // If it's digits and length is reasonable for a phone OR it had the suffix
  if (/^\d{7,20}$/.test(cleanPhone) || id.includes("@c.us")) {
    const contactByPhone = await prisma.contact.findFirst({
      where: {
        companyId,
        phone: cleanPhone,
      },
    });
    if (contactByPhone) return contactByPhone.id;
  }

  // 3. Check if it's a Conversation ID (Very common case)
  // Frontend often passes Conversation ID instead of Contact ID by mistake
  try {
    const convo = await prisma.conversation.findUnique({ where: { id } });
    if (convo && convo.channelId) {
      // The channelId usually contains the phone number (e.g. "57300...")
      // We can use it to find the contact
      const convoPhone = convo.channelId
        .replace("@c.us", "")
        .replace("@g.us", "");
      const contactByConvo = await prisma.contact.findFirst({
        where: {
          companyId,
          phone: convoPhone,
        },
      });
      if (contactByConvo) return contactByConvo.id;
    }
  } catch (e) {
    // Ignore
  }

  // 4. Check if it's a User (Internal Team Member)
  // Sometimes we map users to contacts for self-assinged tasks
  try {
    const user = await prisma.user.findUnique({ where: { id } });
    if (user) {
      // Find or Create Contact for this User
      let linkedContact = await prisma.contact.findFirst({
        where: {
          companyId,
          OR: [
            { email: user.email },
            { phone: user.email.replace("@c.us", "") },
          ],
        },
      });

      if (!linkedContact) {
        linkedContact = await prisma.contact.create({
          data: {
            companyId,
            name: user.name || "Usuario Chat",
            email: user.email.includes("@") ? user.email : null,
            phone: !user.email.includes("@") ? user.email : null,
            tags: ["Auto-creado desde Notas"],
          },
        });
      }
      return linkedContact.id;
    }
  } catch (e) {
    // Ignore
  }

  return undefined;
};

// Get activities
export const getActivities = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const companyId = req.user?.companyId;
    const { dealId, accountId, contactId, type } = req.query;

    if (!companyId) {
      return next(new AppError("Company ID is missing", 400));
    }

    const where: any = { companyId };
    if (dealId) where.dealId = dealId;
    if (accountId) where.accountId = accountId;

    if (contactId) {
      const resolvedId = await resolveContactId(contactId as string, companyId);
      if (resolvedId) where.contactId = resolvedId;
      else where.contactId = contactId; // Fallback to original if resolution fails (likely 0 results)
    }

    if (type) where.type = type;

    const activities = await prisma.activity.findMany({
      where,
      include: {
        createdBy: { select: { name: true, email: true } },
        assignedTo: { select: { name: true, email: true } },
        participants: { select: { id: true, name: true, email: true } },
        mentions: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    res.status(200).json({
      status: "success",
      results: activities.length,
      data: { activities },
    });
  }
);

// Create activity
export const createActivity = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const companyId = req.user?.companyId;
    const userId = req.user?.id;
    const {
      type,
      subject,
      description,
      status,
      dueDate,
      accountId,
      dealId,
      contactId,
      assignedToId,
      participantIds, // Array of user IDs
    } = req.body;

    if (!companyId || !userId) {
      return next(new AppError("Company ID or User ID is missing", 400));
    }

    // Resolve contact ID
    let finalContactId: string | undefined = undefined;
    if (contactId && contactId !== "") {
      console.log(
        `[DEBUG] createActivity - Resolving contactId: ${contactId} for company: ${companyId}`
      );
      const resolved = await resolveContactId(contactId, companyId);
      finalContactId = resolved || contactId;
      console.log(
        `[DEBUG] createActivity - Resolved: ${resolved}, Final: ${finalContactId}`
      );
    }

    // 💬 STEP 1: Process @Mentions in description (if it's a NOTE)
    let mentionedUserIds: string[] = [];
    let contactNameForContext: string | undefined;

    if (description && type === "NOTE") {
      try {
        const mentionData = await mentionService.processText(
          description,
          companyId
        );
        mentionedUserIds = mentionData.mentionedUserIds;

        console.log(
          `[MentionDetect] Found ${mentionedUserIds.length} mentions in note`
        );
      } catch (error) {
        // FAULT TOLERANCE: Log but don't fail the entire operation
        console.error("[MentionDetect] Error processing mentions:", error);
      }
    }

    // Get contact name for notification context
    if (finalContactId) {
      try {
        const contact = await prisma.contact.findUnique({
          where: { id: finalContactId },
          select: { name: true },
        });
        contactNameForContext = contact?.name || undefined;
      } catch (e) {
        // Ignore
      }
    }

    const activity = await prisma.activity.create({
      data: {
        companyId,
        createdById: userId,
        type: type || "NOTE",
        subject,
        description,
        status: status || "PENDING",
        dueDate: dueDate ? new Date(dueDate) : null,
        accountId: accountId && accountId !== "" ? accountId : undefined,
        dealId: dealId && dealId !== "" ? dealId : undefined,
        contactId: finalContactId,
        assignedToId:
          assignedToId && assignedToId !== "" ? assignedToId : undefined,
        participants:
          participantIds &&
          Array.isArray(participantIds) &&
          participantIds.length > 0
            ? { connect: participantIds.map((id: string) => ({ id })) }
            : undefined,
        // 💬 STEP 2: Connect mentioned users
        mentions:
          mentionedUserIds.length > 0
            ? { connect: mentionedUserIds.map((id) => ({ id })) }
            : undefined,
      },
    });

    // Google Calendar Sync: If type is MEETING and dueDate exists
    if (type === "MEETING" && dueDate) {
      const targetUserId = assignedToId || userId;

      try {
        console.log("[ActivityController] Triggering Google Calendar sync");
        const googleEventId = await GoogleCalendarService.createMeetingEvent(
          targetUserId,
          {
            subject,
            description,
            dueDate: new Date(dueDate),
            assignedToId,
            participantIds, // Pass participants to service
          }
        );

        if (googleEventId) {
          // Update activity with Google Event ID
          await prisma.activity.update({
            where: { id: activity.id },
            data: { googleEventId },
          });
          console.log(
            "[ActivityController] Saved Google Event ID:",
            googleEventId
          );
        }
      } catch (err) {
        console.error("[ActivityController] Google Calendar sync failed:", err);
      }
    }

    // 💬 STEP 3: Send notifications to mentioned users (Async, non-blocking)
    if (mentionedUserIds.length > 0) {
      mentionService
        .notifyMentionedUsers(mentionedUserIds, activity.id, userId, {
          type: type || "note",
          subject,
          contactName: contactNameForContext,
        })
        .catch((err) =>
          console.error("[MentionNotify] Failed to notify users:", err)
        );
    }

    res.status(201).json({
      status: "success",
      data: { activity },
    });
  }
);

// Update activity
export const updateActivity = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const { id } = req.params;
    const companyId = req.user?.companyId;

    const activity = await prisma.activity.findFirst({
      where: { id, companyId },
      include: { participants: true },
    });

    if (!activity) {
      return next(new AppError("Activity not found", 404));
    }

    // Sanitize update data
    const updateData: any = { ...req.body };
    if (updateData.accountId === "") updateData.accountId = null;
    if (updateData.dealId === "") updateData.dealId = null;
    if (updateData.contactId === "") updateData.contactId = null;
    if (updateData.assignedToId === "") updateData.assignedToId = null;
    if (updateData.dueDate) updateData.dueDate = new Date(updateData.dueDate);

    // Handle participants update
    if (updateData.participantIds) {
      updateData.participants = {
        set: updateData.participantIds.map((pid: string) => ({ id: pid })),
      };
      delete updateData.participantIds;
    }

    const updatedActivity = await prisma.activity.update({
      where: { id },
      data: updateData,
      include: { participants: true }, // Return updated participants
    });

    // Update Google Calendar event logic
    const shouldSyncWithGoogle =
      updatedActivity.type === "MEETING" && updatedActivity.dueDate;

    if (shouldSyncWithGoogle) {
      const targetUserId =
        updatedActivity.assignedToId || updatedActivity.createdById;
      const activityData = {
        subject: updatedActivity.subject,
        description: updatedActivity.description || undefined,
        dueDate: new Date(updatedActivity.dueDate!),
        assignedToId: updatedActivity.assignedToId || undefined,
        participantIds: updatedActivity.participants.map((p) => p.id),
      };

      if (activity.googleEventId) {
        // CASE A: Exists in Google -> Update it
        console.log(
          "[ActivityController] Updating existing Google Calendar event...",
          { eventId: activity.googleEventId }
        );
        await GoogleCalendarService.updateMeetingEvent(
          targetUserId,
          activity.googleEventId,
          activityData
        );
      } else {
        // CASE B: Missing in Google (Legacy/Error) -> Create it (Self-Healing)
        console.log(
          "[ActivityController] Meeting has no Google ID. Creating new event in Google Calendar (Self-Healing)..."
        );
        try {
          const newEventId = await GoogleCalendarService.createMeetingEvent(
            targetUserId,
            activityData
          );

          if (newEventId) {
            await prisma.activity.update({
              where: { id: updatedActivity.id },
              data: { googleEventId: newEventId },
            });
            console.log(
              "[ActivityController] ✅ Linked legacy meeting to new Google Event:",
              newEventId
            );
          }
        } catch (err) {
          console.error(
            "[ActivityController] Failed to self-heal Google Event:",
            err
          );
        }
      }
    }

    res.status(200).json({
      status: "success",
      data: { activity: updatedActivity },
    });
  }
);

// Delete activity
export const deleteActivity = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const { id } = req.params;
    const companyId = req.user?.companyId;

    const activity = await prisma.activity.findFirst({
      where: { id, companyId },
    });

    if (!activity) {
      return next(new AppError("Activity not found", 404));
    }

    // Delete from Google Calendar if it exists
    if (
      activity.googleEventId &&
      (activity.assignedToId || activity.createdById)
    ) {
      const targetUserId = activity.assignedToId || activity.createdById;
      console.log(
        "[ActivityController] Deleting from Google Calendar:",
        activity.googleEventId
      );
      await GoogleCalendarService.deleteMeetingEvent(
        targetUserId,
        activity.googleEventId
      );
    }

    await prisma.activity.delete({ where: { id } });

    res.status(204).json({
      status: "success",
      data: null,
    });
  }
);
