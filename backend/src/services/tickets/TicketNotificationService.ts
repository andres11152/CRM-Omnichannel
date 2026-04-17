import { Prisma } from "@prisma/client";
import { notificationRepository } from "@/repositories/NotificationRepository";
import { gateway } from "@/gateways/socketGateway";
import { Logger } from "@/utils/logger";
import { TicketDTO } from "@/types/ticket.types";

export class TicketNotificationService {
  async notifyTicketUpdated(
    companyId: string,
    ticketDto: TicketDTO,
    updateDataKeys: string[],
    previousAssignee: string | null,
    newAssignee: string | null,
    updaterName: string,
    updaterId: string,
    ticketOriginalData: {
      id: string;
      ticketNumber: number;
      subject: string | null;
      conversationId: string | null;
    }
  ): Promise<void> {
    try {
      const io = gateway.getIO();

      // Emit to company room
      io.to(`company:${companyId}`).emit("ticket.updated", {
        ticket: ticketDto,
        changedFields: updateDataKeys,
      });

      // Emit to affected agents
      const affectedAgents = new Set<string>();
      if (newAssignee) affectedAgents.add(newAssignee);
      if (previousAssignee) affectedAgents.add(previousAssignee);

      affectedAgents.forEach((agentId) => {
        io.to(`agent:${agentId}`).emit("ticket.updated", {
          ticket: ticketDto,
          changedFields: updateDataKeys,
        });
      });

      // Special notification for assignment
      if (previousAssignee !== newAssignee && newAssignee !== null) {
        io.to(`agent:${newAssignee}`).emit("ticket.assigned", {
          ticket: ticketDto,
          message: `Se te ha asignado el ticket #${ticketOriginalData.ticketNumber}: ${ticketOriginalData.subject}`,
          assignedBy: updaterName || "Sistema",
          timestamp: new Date().toISOString(),
        });

        await notificationRepository
          .create({
            data: {
              companyId,
              userId: newAssignee,
              type: "TICKET_ASSIGNED",
              title: `Ticket #${ticketOriginalData.ticketNumber} asignado`,
              message: `Se te ha asignado: ${ticketOriginalData.subject}`,
              link: `/tickets/${ticketOriginalData.id}`,
              metadata: {
                ticketId: ticketOriginalData.id,
                ticketNumber: ticketOriginalData.ticketNumber,
                conversationId: ticketOriginalData.conversationId,
                assignedBy: updaterId,
              } as unknown as Prisma.InputJsonValue,
              read: false,
            },
          })
          .catch((e) =>
            Logger.error("[TicketNotificationService] Notification failed:", e),
          );
      }
    } catch (e) {
      Logger.error("[TicketNotificationService] Socket emit failed:", e);
    }
  }

  async notifyConversationUpdated(
    companyId: string,
    conversationId: string,
    payload: Record<string, unknown>
  ): Promise<void> {
    try {
      const io = gateway.getIO();
      io.to(`company:${companyId}`).emit("conversation.updated", {
        ...payload,
        id: conversationId,
      });
    } catch (e) {
      Logger.error("[TicketNotificationService] Conversation sync emit failed:", e);
    }
  }

  async notifyTicketCreated(companyId: string, ticketDto: TicketDTO): Promise<void> {
    try {
      gateway.emitToCompany(companyId, "ticket.created", { ticket: ticketDto });
    } catch (e) {
      Logger.error("[TicketNotificationService] Socket emit failed for creation:", e);
    }
  }

  async notifyTicketDeleted(companyId: string, ticketId: string, assignedToId: string | null): Promise<void> {
    try {
      gateway.emitToCompany(companyId, "ticket.deleted", { ticketId });
      if (assignedToId) {
        gateway
          .getIO()
          .to(`agent:${assignedToId}`)
          .emit("ticket.deleted", { ticketId });
      }
    } catch (e) {
      Logger.error("[TicketNotificationService] Socket emit failed for deletion:", e);
    }
  }
}

export const ticketNotificationService = new TicketNotificationService();
