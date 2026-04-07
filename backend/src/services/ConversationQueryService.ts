import { conversationRepository } from "@/repositories/ConversationRepository";
import { contactRepository } from "@/repositories/ContactRepository";
import { ticketSyncService } from "./TicketSyncService";
import { AppError } from "@/utils/AppError";
import { Logger } from "@/utils/logger";
import {
  ConversationListItem,
  ConversationWithRelations,
  Metadata,
} from "@/types/conversation.types";
import { Prisma } from "@prisma/client";

export class ConversationQueryService {
  /**
   * List conversations for Sidebar
   */
  async listConversations(
    companyId: string,
    userId: string,
    role: string,
  ): Promise<ConversationListItem[]> {
    const whereClause: Prisma.ConversationWhereInput = { companyId };
    if (role === "AGENT") {
      whereClause.assignedToId = userId;
    }

    const conversations = await conversationRepository.findAll(whereClause, {
      take: 50,
    });

    return conversations.map((conv) => {
      const customer = conv.participants.find(
        (p) => p.role === "USER" || p.phone === conv.channelId,
      );
      const lastMsg = conv.messages[0];
      const unreadCount = conv.messages.filter(
        (m) => m.direction === "INBOUND" && m.status !== "READ",
      ).length;

      // [SEC] Map last message content for sidebar display
      let lastMsgSnippet = lastMsg?.content || "Nueva conversación";
      if (!lastMsg?.content && lastMsg?.metadata) {
        const metadata = lastMsg.metadata as Metadata;
        const media = metadata.media || metadata.attachment;
        if (media) {
          if (media.type === "image") lastMsgSnippet = "[ Imagen]";
          else if (media.type === "video") lastMsgSnippet = "[ Video]";
          else if (media.type === "audio") lastMsgSnippet = "[ Audio]";
          else if (media.type === "document") lastMsgSnippet = "[ Documento]";
          else if (media.type === "sticker") lastMsgSnippet = "[Sticker]";
        }
      }

      return {
        id: conv.id,
        ticketId: conv.id,
        contactName: customer?.name || conv.subject || "Usuario",
        contactPhone: customer?.phone || conv.channelId || "",
        lastMessage: lastMsgSnippet,
        lastMessageTime: lastMsg?.createdAt || conv.updatedAt,
        unreadCount,
        status: conv.status.toLowerCase(),
        assignedTo: conv.assignedTo?.name,
        channel: "whatsapp",
        participants: conv.participants,
      };
    });
  }

  /**
   * Get Detail of a Conversation (with full Message history)
   */
  async getConversation(companyId: string, id: string): Promise<ConversationWithRelations> {
    let conversation = await conversationRepository.findByIdWithRelations(
      companyId,
      id,
    );

    // B. Link Ticket if not found directly
    if (!conversation) {
      const ticket = await ticketSyncService.findByIdWithCreator(id);
      if (ticket && ticket.companyId === companyId) {
        if (ticket.conversationId) {
          conversation = await conversationRepository.findByIdWithRelations(
            companyId,
            ticket.conversationId,
          );
        } else {
          // Fallback: This should have been handled by TicketSyncService
          // but we keep it here for data consistency
          Logger.warn(`[QueryService] Syncing missing conversation for ticket: ${id}`);
        }
      }
    }

    if (!conversation || conversation.companyId !== companyId) {
      throw new AppError("Conversation not found", 404);
    }

    const messagesWithProps = conversation.messages.map((msg) => {
      const metadata = (
        msg.metadata && typeof msg.metadata === "object" ? msg.metadata : {}
      ) as Metadata;
      const att = metadata.media || metadata.attachment;

      // [SEC] Map Baileys/Prisma direction to Frontend 'sender' role
      let senderRole: "agent" | "customer" | "system" = "customer";
      if (msg.direction === "OUTBOUND") {
        senderRole = "agent";
      } else if ((msg.sender as { role?: string })?.role === "SYSTEM") {
        senderRole = "system";
      }

      return {
        ...msg,
        timestamp: msg.createdAt, // [SEC] Compatibility with Frontend Message interface
        attachment: att,
        sender: senderRole,
        senderName: (msg.sender as { name?: string })?.name || "Usuario",
        type: att ? (att.type as string) : "text",
        mediaUrl: att?.url || undefined,
      };
    });

    // [SEC] Prioritize Contact Tags
    let resolvedTags = conversation.tags;
    if (conversation.contactId) {
      const contact = await contactRepository.findFirst({
        where: { id: conversation.contactId },
        select: { tags: true },
      });
      if (contact?.tags && contact.tags.length > 0) {
        resolvedTags = contact.tags;
      }
    }

    //  ON-DEMAND CONTEXT SYNC (Async)
    const CONTEXT_SYNC_THRESHOLD = 20;
    const cleanChannelId = (conversation.channelId || "").replace(/\D/g, "");
    const hasValidPhone = cleanChannelId && (conversation.isGroup || /^\d{5,15}$/.test(cleanChannelId));

    if (messagesWithProps.length < CONTEXT_SYNC_THRESHOLD && hasValidPhone) {
      this.triggerContextSync(companyId, conversation.id, conversation.channelId!);
    }

    return {
      ...conversation,
      tags: resolvedTags,
      messages: messagesWithProps,
    } as unknown as ConversationWithRelations;
  }

  private triggerContextSync(companyId: string, conversationId: string, phone: string) {
    import("./chatSyncService").then(({ chatSyncService }) => {
      chatSyncService.contextSync(companyId, conversationId, phone).catch((err: Error) =>
        Logger.warn(`[QueryService] Context sync failed:`, { error: err.message }),
      );
    });
  }
}

export const conversationQueryService = new ConversationQueryService();
