import { Response, NextFunction } from "express";
import { AppError } from "../../utils/AppError";
import { catchAsync } from "../../utils/catchAsync";
import { AuthenticatedRequest } from "../../types";
import { prisma } from "../../config/prisma";
import { GoogleCalendarService } from "../../services/googleCalendarService";

const resolveContactId = async (id: string, companyId: string) => {
  if (!id) return undefined;

  // 1. Check if it's already a Contact
  const contact = await prisma.contact.findUnique({ where: { id } });
  if (contact) return id;

  // 2. Check if it's a User
  const user = await prisma.user.findUnique({ where: { id } });
  if (user) {
    // Find or Create Contact for this User
    let linkedContact = await prisma.contact.findFirst({
      where: {
        companyId,
        OR: [{ email: user.email }, { phone: user.email.replace("@c.us", "") }],
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
        contactId:
          contactId && contactId !== ""
            ? await resolveContactId(contactId, companyId)
            : undefined,
        assignedToId:
          assignedToId && assignedToId !== "" ? assignedToId : undefined,
        participants:
          participantIds && Array.isArray(participantIds) && participantIds.length > 0
            ? { connect: participantIds.map((id: string) => ({ id })) }
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
          set: updateData.participantIds.map((pid: string) => ({ id: pid }))
       };
       delete updateData.participantIds;
    }

    const updatedActivity = await prisma.activity.update({
      where: { id },
      data: updateData,
      include: { participants: true } // Return updated participants
    });

    // Update Google Calendar event if it exists and relevant fields changed
    if (
      activity.googleEventId &&
      (updateData.subject ||
        updateData.description ||
        updateData.dueDate ||
        updateData.assignedToId ||
        updateData.participants)
    ) {
      console.log(
        "[ActivityController] Attempting to update Google Calendar event...",
        {
          eventId: activity.googleEventId,
          changedFields: Object.keys(updateData),
        }
      );

      const targetUserId =
        updatedActivity.assignedToId || updatedActivity.createdById;
      
      const activityData = {
        subject: updatedActivity.subject,
        description: updatedActivity.description || undefined,
        dueDate: updatedActivity.dueDate
          ? new Date(updatedActivity.dueDate)
          : new Date(),
        assignedToId: updatedActivity.assignedToId || undefined,
        participantIds: updatedActivity.participants.map(p => p.id),
      };

      if (updatedActivity.dueDate) {
        console.log(
          "[ActivityController] Calling GoogleCalendarService.updateMeetingEvent",
          { targetUserId, eventId: activity.googleEventId }
        );
        await GoogleCalendarService.updateMeetingEvent(
          targetUserId,
          activity.googleEventId,
          activityData
        );
      } else {
        console.log(
          "[ActivityController] Skipping Google Update: No Due Date on updated activity"
        );
      }
    } else {
      console.log(
        "[ActivityController] Skipping Google Update: No Google Event ID or no relevant changes",
        {
          hasGoogleEventId: !!activity.googleEventId,
          googleEventId: activity.googleEventId,
          updateDataKeys: Object.keys(updateData),
        }
      );
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
