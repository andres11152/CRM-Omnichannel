import { Prisma, TicketStatus, TicketPriority, TicketResolutionType, ConversationStatus } from "@prisma/client";
import { ticketRepository } from "@/repositories/TicketRepository";
import { contactRepository } from "@/repositories/ContactRepository";
import { conversationRepository } from "@/repositories/ConversationRepository";
import { Logger } from "@/utils/logger";
import { AppError } from "@/utils/AppError";

export class TicketTransitionManager {
  async evaluateStatusTransitions(
    existingTicket: { status: TicketStatus },
    data: Record<string, unknown>
  ): Promise<Prisma.TicketUpdateInput> {
    const updateData: Prisma.TicketUpdateInput = {};

    if (data.status === "RESOLVED" || data.status === "CLOSED") {
      if (
        existingTicket.status !== "RESOLVED" &&
        existingTicket.status !== "CLOSED"
      ) {
        updateData.resolvedAt = new Date();
      }
    } else if (data.status === "OPEN" || data.status === "IN_PROGRESS") {
      if (
        existingTicket.status === "RESOLVED" ||
        existingTicket.status === "CLOSED"
      ) {
        // Enterprise: Reset resolution audit if reopened
        updateData.resolvedAt = null;
        updateData.resolutionType = null as unknown as TicketResolutionType;
        updateData.resolutionNotes = null as unknown as string;
      }
    }

    if (data.subject !== undefined) updateData.subject = data.subject as string;
    if (data.description !== undefined)
      updateData.description = data.description as string;
    if (data.priority !== undefined)
      updateData.priority = data.priority as TicketPriority;
    if (data.status !== undefined)
      updateData.status = data.status as TicketStatus;

    if (data.queueId !== undefined) {
      updateData.queue = data.queueId
        ? { connect: { id: data.queueId as string } }
        : { disconnect: true };
    }

    if (data.assignedToId !== undefined) {
      updateData.assignedTo = data.assignedToId
        ? { connect: { id: data.assignedToId as string } }
        : { disconnect: true };
      if (data.status === undefined) {
        updateData.status = data.assignedToId ? "IN_PROGRESS" : "OPEN";
      }
    }

    if (data.resolvedAt !== undefined)
      updateData.resolvedAt = data.resolvedAt as Date;
    if (data.resolutionType !== undefined)
      updateData.resolutionType = data.resolutionType as TicketResolutionType;
    if (data.resolutionNotes !== undefined)
      updateData.resolutionNotes = data.resolutionNotes as string;

    return updateData;
  }

  async syncConversation(
    updatedTicket: {
      companyId: string;
      conversationId: string | null;
    },
    data: Record<string, unknown>
  ) {
    if (!updatedTicket.conversationId) return;

    let needsSync = false;
    const uncheckedSyncData: Prisma.ConversationUncheckedUpdateInput = {};

    if (data.queueId !== undefined) {
      uncheckedSyncData.queueId = (data.queueId as string) || null;
      needsSync = true;
    }
    if (data.assignedToId !== undefined) {
      uncheckedSyncData.assignedToId = (data.assignedToId as string) || null;
      needsSync = true;
    }
    if (data.status !== undefined) {
      needsSync = true;
      uncheckedSyncData.status = data.status as ConversationStatus;
      if (data.status === "RESOLVED" || data.status === "CLOSED") {
        uncheckedSyncData.resolvedAt = new Date();
      } else {
        uncheckedSyncData.resolvedAt = null;
      }
    }

    if (needsSync) {
      await conversationRepository
        .updateConversation(updatedTicket.companyId, updatedTicket.conversationId, uncheckedSyncData)
        .catch((e) => Logger.error("[TicketTransitionManager] sync error:", e));
    }
  }

  async handleSpamAction(
    updaterId: string,
    updatedTicket: {
      id: string;
      companyId: string;
      conversationId: string | null;
    },
    data: Record<string, unknown>
  ) {
    if (data.resolutionType === "SPAM" && updatedTicket.conversationId) {
      try {
        const conv = await conversationRepository.findByIdAndCompanyId(
          updatedTicket.conversationId,
          updatedTicket.companyId,
        );
        if (conv?.contactId) {
          await contactRepository.update(updatedTicket.companyId, conv.contactId, {
            isBlocked: true,
            blockedAt: new Date(),
            blockedReason: "SPAM",
          });
        } else if (conv?.channelId) {
          const contact = await contactRepository.findWithDeleted(
            updatedTicket.companyId,
            conv.channelId,
          );
          if (contact) {
            await contactRepository.update(updatedTicket.companyId, contact.id, {
              isBlocked: true,
              blockedAt: new Date(),
              blockedReason: "SPAM",
            });
          }
        }
        await ticketRepository.update({
          where: { id: updatedTicket.id },
          data: { deletedAt: new Date(), deletedBy: updaterId || "system" },
        });
      } catch (error) {
        Logger.error(
          "[TicketTransitionManager] Failed to auto-block SPAM contact:",
          error,
        );
      }
    }
  }

  async triggerAutoAssignment(ticketId: string, queueId: string | null, assignedToId: string | null) {
    if (queueId && !assignedToId) {
      try {
        const { assignTicketToAgent } = await import("@/services/AutoAssignmentService");
        await assignTicketToAgent(ticketId, queueId);
      } catch (error) {
        Logger.error("[TicketTransitionManager] Auto-assignment failed:", error);
      }
    }
  }
}

export const ticketTransitionManager = new TicketTransitionManager();
