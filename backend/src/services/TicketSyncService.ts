import { TicketRepository } from "@/repositories/TicketRepository";
import { TicketStatus } from "@prisma/client";
import { Logger } from "@/utils/logger";
import { DistributedLock } from "@/utils/distributedLock";

const ticketRepository = new TicketRepository();

export class TicketSyncService {
  /**
   * [SEC] ENSURE TICKET EXISTS
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
          companyId,
          conversationId,
        );

        const isTicketActive =
          existingTicket &&
          (existingTicket.status === TicketStatus.OPEN ||
            existingTicket.status === TicketStatus.IN_PROGRESS);

        if (!isTicketActive) {
          const lastTicket = await ticketRepository.findFirst({
            orderBy: { ticketNumber: "desc" },
            select: { ticketNumber: true },
          }, companyId);

          const nextTicketNumber = (lastTicket?.ticketNumber || 0) + 1;

          await ticketRepository.create({
            data: {
              ticketNumber: nextTicketNumber,
              conversation: { connect: { id: conversationId } },
              subject,
              description,
              company: { connect: { id: companyId } },
              createdBy: { connect: { id: agentId } },
              assignedTo: { connect: { id: agentId } }, // Auto-assign to the creator (Agent)
              status: TicketStatus.IN_PROGRESS, // Active state
            },
          }, companyId);

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
   * [SEARCH] FIND RECIPIENT PHONE FROM TICKET
   * Fallback for when conversation.channelId is not a clean phone.
   */
  async findPhoneByConversation(companyId: string, conversationId: string): Promise<string | null> {
    const ticket = await ticketRepository.findByConversationId(companyId, conversationId);
    if (!ticket) return null;

    const emailPhone = ticket.createdBy.email.split("@")[0];
    if (emailPhone && /^\d+$/.test(emailPhone)) return emailPhone;

    return ticket.createdBy.phone || null;
  }

  async findConversationIdByTicket(ticketId: string, companyId: string): Promise<string | null> {
    const ticket = await ticketRepository.findById(ticketId, companyId);
    if (!ticket) return null;
    return ticket.conversationId;
  }

  async findByIdWithCreator(ticketId: string, companyId: string) {
    return ticketRepository.findByIdWithCreator(ticketId, companyId);
  }

  async updateConversationId(ticketId: string, companyId: string, conversationId: string): Promise<void> {
    await ticketRepository.updateConversationId(ticketId, companyId, conversationId);
  }
}

export const ticketSyncService = new TicketSyncService();

