import { TicketRepository } from "@/repositories/TicketRepository";
import { TicketStatus } from "@prisma/client";
import { Logger } from "@/utils/logger";
import { DistributedLock } from "@/utils/distributedLock";

const ticketRepository = new TicketRepository();

export class TicketSyncService {
  /**
   * 🛡️ ENSURE TICKET EXISTS
   * Every conversation MUST have an active ticket for visibility in Agent Workspace.
   */
  async ensureActiveTicket(params: {
    companyId: string;
    conversationId: string;
    agentId: string;
    subject: string;
    description: string;
  }): Promise<void> {
    const { companyId, conversationId, agentId, subject, description } = params;

    const lockKey = `ticket_sync:${conversationId}`;

    await DistributedLock.run(
      lockKey,
      async () => {
        const existingTicket = await ticketRepository.findByConversationId(
          conversationId,
        );

        const isTicketActive =
          existingTicket &&
          (existingTicket.status === TicketStatus.OPEN ||
            existingTicket.status === TicketStatus.IN_PROGRESS);

        if (!isTicketActive) {
          const lastTicket = await ticketRepository.findFirst({
            where: { companyId },
            orderBy: { ticketNumber: "desc" },
            select: { ticketNumber: true },
          });

          const nextTicketNumber = (lastTicket?.ticketNumber || 0) + 1;

          await ticketRepository.create({
            data: {
              ticketNumber: nextTicketNumber,
              companyId,
              conversationId,
              subject,
              description,
              createdById: agentId,
              assignedToId: agentId, // Auto-assign to the creator (Agent)
              status: TicketStatus.IN_PROGRESS, // Active state
            },
          });

          Logger.info(
            `[TicketSyncService] Created auto-ticket #${nextTicketNumber} for conversation ${conversationId}`,
          );
        }
      },
      5000,
      10000,
    );
  }

  /**
   * 🔍 FIND RECIPIENT PHONE FROM TICKET
   * Fallback for when conversation.channelId is not a clean phone.
   */
  async findPhoneByConversation(conversationId: string): Promise<string | null> {
    const ticket = await ticketRepository.findByConversationId(conversationId);
    if (!ticket) return null;

    const emailPhone = ticket.createdBy.email.split("@")[0];
    if (emailPhone && /^\d+$/.test(emailPhone)) return emailPhone;

    return ticket.createdBy.phone || null;
  }

  async findConversationIdByTicket(ticketId: string, companyId: string): Promise<string | null> {
    const ticket = await ticketRepository.findById(ticketId);
    if (!ticket || ticket.companyId !== companyId) return null;
    return ticket.conversationId;
  }

  async findByIdWithCreator(ticketId: string) {
    return ticketRepository.findByIdWithCreator(ticketId);
  }

  async updateConversationId(ticketId: string, conversationId: string): Promise<void> {
    await ticketRepository.updateConversationId(ticketId, conversationId);
  }
}

export const ticketSyncService = new TicketSyncService();
