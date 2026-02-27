import { ContactRepository } from "@/repositories/ContactRepository";
import { ConversationRepository } from "@/repositories/ConversationRepository";
import { MessageRepository } from "@/repositories/MessageRepository";
import { UserRepository } from "@/repositories/UserRepository";
import { TicketRepository } from "@/repositories/TicketRepository";
import { DomainEventBus, DomainEventType } from "@/events/DomainEventBus";
import { IncomingMessagePayload } from "@/types/message.types";
import { Logger } from "@/utils/logger";
import { ContactStrategy } from "@/utils/contactStrategy";
import { Channel, MessageDirection, UserRole, Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";

export class MessageOrchestrator {
  constructor(
    private contactRepo: ContactRepository,
    private conversationRepo: ConversationRepository,
    private messageRepo: MessageRepository,
    private userRepo: UserRepository,
    private ticketRepo: TicketRepository,
    private eventBus: DomainEventBus,
  ) {}

  async processIncoming(payload: IncomingMessagePayload) {
    const { remoteJid, companyId, text, isOutbound } = payload;
    Logger.info(
      `[Orchestrator] Processing ${isOutbound ? "OUT" : "IN"} for ${remoteJid}`,
    );

    // 1. Resolve Identity
    const identity = ContactStrategy.resolveName(
      remoteJid,
      payload.contactName || payload.senderName,
      isOutbound,
    );

    // 2. Handle Contact (Repository)
    let contact = await this.contactRepo.findByPhone(companyId, remoteJid);
    if (!contact) {
      contact = await this.contactRepo.create(
        companyId,
        remoteJid,
        identity.contactName,
      );
    }

    // 3. Handle User (via UserRepository — no direct Prisma)
    const userEmail = `${remoteJid}@whatsapp.user`;
    const user = await this.userRepo.upsert(
      { email: userEmail },
      {
        email: userEmail,
        name: identity.subjectDisplayName,
        phone: remoteJid,
        role: UserRole.USER,
        password: await bcrypt.hash(remoteJid, 10),
        company: { connect: { id: companyId } },
      },
      {
        name: identity.subjectDisplayName,
      },
    );

    // 4. Handle Conversation (Repository)
    let conversation = await this.conversationRepo.findByChannelId(
      companyId,
      remoteJid,
    );
    if (!conversation) {
      conversation = await this.conversationRepo.create({
        companyId,
        channelId: remoteJid,
        subject: identity.subjectDisplayName,
        userId: user.id,
        contactId: contact.id,
      });
    }

    // 4.1. Ensure Active Ticket (Auto-Create for new conversations or re-opens)
    let ticket = await this.ticketRepo.findFirst({
      where: {
        conversationId: conversation.id,
        status: { not: "CLOSED" },
      },
      orderBy: { createdAt: "desc" },
    });

    if (!ticket) {
      // Need to create a new ticket
      const lastTicket = await this.ticketRepo.findFirst({
        where: { companyId },
        orderBy: { ticketNumber: "desc" },
        select: { ticketNumber: true },
      });
      const nextNumber =
        ((lastTicket as { ticketNumber?: number })?.ticketNumber || 0) + 1;

      ticket = await this.ticketRepo.create({
        data: {
          companyId,
          conversationId: conversation.id,
          status: "OPEN",
          priority: "MEDIUM",
          subject:
            contact?.name ||
            identity.subjectDisplayName ||
            identity.contactName ||
            remoteJid,
          description: text.substring(0, 100),
          ticketNumber: nextNumber,
          createdById: user.id,
        },
      });
      Logger.info(
        `[Orchestrator] Created new ticket #${ticket.ticketNumber} for conv ${conversation.id}`,
      );
    }

    // 5. Persist Message (Repository)
    const duplicate = await this.messageRepo.findDuplicate(
      conversation.id,
      text,
    );
    if (duplicate) {
      Logger.warn("[Orchestrator] Duplicate message detected, skipping.");
      return;
    }

    const message = await this.messageRepo.create({
      data: {
        companyId,
        conversationId: conversation.id,
        content: text,
        direction: isOutbound
          ? MessageDirection.OUTBOUND
          : MessageDirection.INBOUND,
        senderId: user.id,
        channel: Channel.WHATSAPP,
        metadata:
          payload.hasMedia && payload.media
            ? { media: payload.media as unknown as Prisma.InputJsonObject }
            : undefined,
      },
    });

    // 5.1. Update Conversation Stats (Unread Badge + Sorting)
    if (!isOutbound) {
      await this.conversationRepo.incrementUnread(conversation.id);
    } else {
      await this.conversationRepo.update(conversation.id, {
        updatedAt: new Date(),
      });
    }

    // 6. Emit Event (Decoupled Socket/Flow/AI)
    this.eventBus.publish(DomainEventType.MESSAGE_RECEIVED, {
      message,
      companyId,
      conversationId: conversation.id,
      senderId: user.id,
    });

    Logger.info(`[Orchestrator] Message ${message.id} processed successfully`);
  }
}

// Singleton Instance
export const messageOrchestrator = new MessageOrchestrator(
  new ContactRepository(),
  new ConversationRepository(),
  new MessageRepository(),
  new UserRepository(),
  new TicketRepository(),
  DomainEventBus.getInstance(),
);
