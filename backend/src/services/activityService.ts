import { GoogleCalendarService } from "./googleCalendarService";
import { mentionService } from "./mentionService";
import { ActivityType, Prisma } from "@prisma/client";
import { AppError } from "../utils/AppError";
import { contactRepository } from "@/repositories/ContactRepository";
import { conversationRepository } from "@/repositories/ConversationRepository";
import { userRepository } from "@/repositories/UserRepository";
import { activityRepository } from "@/repositories/ActivityRepository";
import { Logger } from "@/utils/logger";

type CreateActivityDTO = {
  companyId: string;
  userId: string;
  type?: string;
  subject: string;
  description?: string;
  status?: string;
  dueDate?: string | Date;
  accountId?: string;
  dealId?: string;
  contactId?: string;
  assignedToId?: string;
  participantIds?: string[];
};

type UpdateActivityDTO = {
  id: string;
  companyId: string;
  type?: ActivityType;
  subject?: string;
  description?: string;
  status?: string;
  dueDate?: string | Date;
  accountId?: string | null;
  dealId?: string | null;
  contactId?: string | null;
  assignedToId?: string | null;
  participantIds?: string[];
};

const resolveContactId = async (id: string, companyId: string) => {
  if (!id) return undefined;

  try {
    const contact = await contactRepository.findFirst({
      where: { id },
    });
    if (contact) return id;
  } catch (e: unknown) {
    if (e) Logger.warn("Cannot extract contact", e as Record<string, unknown>);
  }

  const cleanPhone = id.replace("@c.us", "").replace("@g.us", "");
  if (/^\d{7,20}$/.test(cleanPhone) || id.includes("@c.us")) {
    const contactByPhone = await contactRepository.findFirst({
      where: { companyId, phone: cleanPhone },
    });
    if (contactByPhone) return contactByPhone.id;
  }

  try {
    const convo = await conversationRepository.findFirst({
      where: { id },
      select: { id: true, contactId: true, channelId: true, companyId: true },
    });

    if (convo) {
      if (convo.contactId) {
        return convo.contactId;
      }
      const isGroup =
        convo.channelId?.includes("@g.us") ||
        convo.channelId?.startsWith("120");

      if (convo.channelId && !isGroup) {
        const convoPhone = convo.channelId
          .replace("@c.us", "")
          .replace("@s.whatsapp.net", "");

        if (/^\d{8,15}$/.test(convoPhone)) {
          const contactByConvo = await contactRepository.findFirst({
            where: { companyId, phone: convoPhone },
          });

          if (contactByConvo) {
            if (!convo.contactId) {
              await conversationRepository.update(convo.id, {
                contact: { connect: { id: contactByConvo.id } },
              });
            }
            return contactByConvo.id;
          }
        }
      }
      return undefined;
    }
  } catch (err) {
    Logger.error("[resolveContactId] Error in conversation lookup:", err);
  }

  try {
    const user = await userRepository.findFirst({ where: { id } });
    if (user) {
      let linkedContact = await contactRepository.findFirst({
        where: {
          companyId,
          OR: [
            { email: user.email },
            { phone: user.email.replace("@c.us", "") },
          ],
        },
      });

      if (!linkedContact) {
        linkedContact = await contactRepository.create(
          companyId,
          !user.email.includes("@") ? user.email : "",
          user.name || "Usuario Chat",
        );
        // Update with email if available
        if (user.email.includes("@")) {
          await contactRepository.update(linkedContact.id, {
            email: user.email,
            tags: ["Auto-creado desde Notas"],
          });
        }
      }
      return linkedContact.id;
    }
  } catch (e: unknown) {
    if (e)
      Logger.warn(
        "Failed internal user query fallback",
        e as Record<string, unknown>,
      );
  }

  return undefined;
};

export class ActivityService {
  async getActivities(params: {
    companyId: string;
    dealId?: string;
    accountId?: string;
    contactId?: string;
    type?: string;
  }) {
    const { companyId, dealId, accountId, contactId, type } = params;

    const where: Prisma.ActivityWhereInput = { companyId };
    if (dealId) where.dealId = dealId;
    if (accountId) where.accountId = accountId;

    if (contactId) {
      const resolvedId = await resolveContactId(contactId, companyId);
      where.contactId = resolvedId || contactId;
    }

    if (type) {
      const isValidType = Object.values(ActivityType).includes(
        type as ActivityType,
      );
      if (isValidType) {
        where.type = type as ActivityType;
      }
    }

    return await activityRepository.findMany({
      where,
      include: {
        createdBy: { select: { name: true, email: true } },
        assignedTo: { select: { name: true, email: true } },
        participants: { select: { id: true, name: true, email: true } },
        mentions: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async createActivity(data: CreateActivityDTO) {
    const {
      companyId,
      userId,
      type,
      subject,
      description,
      status,
      dueDate,
      accountId,
      dealId,
      contactId,
      assignedToId,
      participantIds,
    } = data;

    let finalContactId: string | undefined = undefined;
    if (contactId && contactId !== "") {
      finalContactId = await resolveContactId(contactId, companyId);
    }

    let mentionedUserIds: string[] = [];
    let contactNameForContext: string | undefined;

    if (description && type === "NOTE") {
      try {
        const mentionData = await mentionService.processText(
          description,
          companyId,
        );
        mentionedUserIds = mentionData.mentionedUserIds;
      } catch (error) {
        Logger.error("[MentionDetect] Error processing mentions:", error);
      }
    }

    if (finalContactId) {
      try {
        const contact = await contactRepository.findFirst({
          where: { id: finalContactId },
          select: { name: true },
        });
        contactNameForContext = contact?.name || undefined;
      } catch (e: unknown) {
        if (e)
          Logger.warn(
            "Error looking up contact for mention UI",
            e as Record<string, unknown>,
          );
      }
    }

    const activity = await activityRepository.create({
      data: {
        companyId,
        createdById: userId,
        type: (type as ActivityType) || "NOTE",
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
          participantIds && participantIds.length > 0
            ? { connect: participantIds.map((id) => ({ id })) }
            : undefined,
        mentions:
          mentionedUserIds.length > 0
            ? { connect: mentionedUserIds.map((id) => ({ id })) }
            : undefined,
      },
    });

    if (type === "MEETING" && dueDate) {
      const targetUserId = assignedToId || userId;
      try {
        const googleEventId = await GoogleCalendarService.createMeetingEvent(
          targetUserId,
          {
            subject,
            description,
            dueDate: new Date(dueDate),
            assignedToId,
            participantIds,
          },
        );

        if (googleEventId) {
          await activityRepository.update({
            where: { id: activity.id },
            data: { googleEventId },
          });
        }
      } catch (err) {
        Logger.error("[ActivityService] Google Calendar sync failed:", err);
      }
    }

    if (mentionedUserIds.length > 0) {
      mentionService
        .notifyMentionedUsers(
          mentionedUserIds,
          activity.id,
          userId,
          companyId,
          {
            type: type || "note",
            subject,
            contactName: contactNameForContext,
          },
        )
        .catch((err) =>
          Logger.error("[MentionNotify] Failed to notify users:", err),
        );
    }

    return activity;
  }

  async updateActivity(data: UpdateActivityDTO) {
    const { id, companyId, participantIds, ...restBody } = data;

    const activity = await activityRepository.findFirst({
      where: { id, companyId },
      include: { participants: true },
    });

    if (!activity) {
      throw new AppError("Activity not found", 404);
    }

    const updateData: Prisma.ActivityUncheckedUpdateInput = {
      ...restBody,
      type: restBody.type as ActivityType | undefined,
    };

    if (updateData.accountId === "") updateData.accountId = null;
    if (updateData.dealId === "") updateData.dealId = null;
    if (updateData.contactId === "") updateData.contactId = null;
    if (updateData.assignedToId === "") updateData.assignedToId = null;
    if (updateData.dueDate)
      updateData.dueDate = new Date(updateData.dueDate as string);

    if (participantIds) {
      updateData.participants = {
        set: participantIds.map((pid) => ({ id: pid })),
      };
    }

    const updatedActivity = (await activityRepository.update({
      where: { id },
      data: updateData,
      include: { participants: true },
    })) as Prisma.ActivityGetPayload<{ include: { participants: true } }>;

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
        await GoogleCalendarService.updateMeetingEvent(
          targetUserId,
          activity.googleEventId,
          activityData,
        );
      } else {
        try {
          const newEventId = await GoogleCalendarService.createMeetingEvent(
            targetUserId,
            activityData,
          );

          if (newEventId) {
            await activityRepository.update({
              where: { id: updatedActivity.id },
              data: { googleEventId: newEventId },
            });
          }
        } catch (err) {
          Logger.error(
            "[ActivityService] Failed to self-heal Google Event:",
            err,
          );
        }
      }
    }

    return updatedActivity;
  }

  async deleteActivity(id: string, companyId: string) {
    const activity = await activityRepository.findFirst({
      where: { id, companyId },
    });

    if (!activity) {
      throw new AppError("Activity not found", 404);
    }

    if (
      activity.googleEventId &&
      (activity.assignedToId || activity.createdById)
    ) {
      const targetUserId = activity.assignedToId || activity.createdById;
      await GoogleCalendarService.deleteMeetingEvent(
        targetUserId,
        activity.googleEventId,
      );
    }

    await activityRepository.delete(id);
    return true;
  }
}

export const activityService = new ActivityService();
