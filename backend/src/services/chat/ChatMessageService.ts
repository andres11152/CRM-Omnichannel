import { Prisma } from "@prisma/client";
import { messageRepository } from "@/repositories/MessageRepository";
import { ticketRepository } from "@/repositories/TicketRepository";
import { DistributedLock } from "@/utils/distributedLock";
import { Logger } from "@/utils/logger";

/**
 * [CHAT] CHAT MESSAGE & TICKET SERVICE
 * Handles message persistence and automated ticketing logic.
 */
export class ChatMessageService {
  async doesMessageExist(whatsappMessageId: string, companyId: string): Promise<boolean> {
    const exists = await messageRepository.findUnique({
      where: { companyId_whatsappMessageId: { companyId, whatsappMessageId } },
      select: { id: true },
    });
    return !!exists;
  }

  /**
   * Persist Message
   */
  async upsertMessage(data: {
    whatsappMessageId: string;
    companyId: string;
    content: string;
    direction: "INBOUND" | "OUTBOUND";
    conversationId: string;
    senderId: string;
    status: "SENT" | "DELIVERED" | "QUEUED" | "REVOKED" | "READ" | "FAILED";
    metadata: Prisma.InputJsonValue;
    createdAt?: Date;
  }): Promise<Prisma.MessageGetPayload<{ include: { sender: true } }>> {
    return messageRepository.upsert({
      where: {
        companyId_whatsappMessageId: {
          companyId: data.companyId,
          whatsappMessageId: data.whatsappMessageId,
        },
      },
      create: {
        companyId: data.companyId,
        content: data.content,
        channel: "WHATSAPP",
        direction: data.direction,
        conversationId: data.conversationId,
        senderId: data.senderId,
        status: data.status,
        whatsappMessageId: data.whatsappMessageId,
        metadata: data.metadata,
        ...(data.createdAt && { createdAt: data.createdAt }),
      },
      update: {}, // Immutable
      include: { sender: true },
    });
  }

  /**
   * Update message status (DELIVERED, READ, FAILED)
   */
  async updateMessageStatus(
    whatsappMessageId: string,
    companyId: string,
    status: "SENT" | "DELIVERED" | "READ" | "FAILED"
  ): Promise<Prisma.BatchPayload> {
    return messageRepository.updateMany({
      where: { whatsappMessageId, companyId },
      data: { status },
    });
  }

  // --- Ticket Methods ---

  async findActiveTicket(companyId: string, conversationId: string): Promise<Prisma.TicketGetPayload<object> | null> {
    return ticketRepository.findFirst({
      where: {
        conversationId,
        status: { in: ["OPEN", "IN_PROGRESS"] },
      },
    });
  }

  async ensureTicket(
    companyId: string,
    conversationId: string,
    customerId: string,
    subject: string,
    description: string,
    queueId?: string | null,
  ): Promise<Prisma.TicketGetPayload<object>> {
    const lockKey = `ticket_create:${conversationId}`;
    return await DistributedLock.run(
      lockKey,
      async () => {
        let ticket = await ticketRepository.findFirst({
          where: {
            conversationId,
            status: { in: ["OPEN", "IN_PROGRESS"] },
          },
        });

        if (!ticket) {
          const lastTicket = await ticketRepository.findFirst({
            orderBy: { ticketNumber: "desc" },
            select: { ticketNumber: true },
          });
          const nextNum = (lastTicket?.ticketNumber || 0) + 1;

          ticket = await ticketRepository.create({
            data: {
              company: { connect: { id: companyId } },
              ticketNumber: nextNum,
              subject,
              description: description.substring(0, 100),
              status: "OPEN",
              priority: "MEDIUM",
              createdBy: { connect: { id: customerId } },
              conversation: { connect: { id: conversationId } },
              queue: queueId ? { connect: { id: queueId } } : undefined,
            },
          });
        } else if (queueId && !ticket.queueId) {
          ticket = await ticketRepository.update({
            where: { id: ticket.id },
            data: { queue: { connect: { id: queueId } } },
          });
          Logger.info(
            `[ChatMessageService] 🩹 Self-healed ticket ${ticket.id} with queueId ${queueId}`,
          );
        }

        return ticket;
      },
      5000,
      10000,
    );
  }
}

export const chatMessageService = new ChatMessageService();
