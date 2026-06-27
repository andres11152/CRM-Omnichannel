import { conversationRepository } from "@/repositories/ConversationRepository";
import { contactRepository } from "@/repositories/ContactRepository";
import { ticketSyncService } from "./TicketSyncService";
import { AppError } from "@/utils/AppError";
import { Logger } from "@/utils/logger";
import { WhatsAppIdUtils } from "@/whatsapp/utils/WhatsAppIdUtils";
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
      const isGroup = conv.isGroup || false;
      const groupMetadata = (conv.groupMetadata || null) as {
        groupName?: string;
        groupPicUrl?: string | null;
      } | null;

      // [PERF] Auto-Heal Corrupted Group Metadata on Sidebar Load
      if (isGroup && (conv.subject?.includes("Grupo Histórico") || !groupMetadata?.groupName || groupMetadata.groupName === "Grupo Histórico")) {
        this.triggerGroupHeal(companyId, conv.channelId);
      }

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

      // For groups: use groupPicUrl; for DMs: use customer profilePicUrl
      const resolvedAvatarUrl = isGroup
        ? groupMetadata?.groupPicUrl || conv.contact?.avatarUrl || null
        : conv.contact?.avatarUrl || null;
      const resolvedProfilePicUrl = isGroup
        ? groupMetadata?.groupPicUrl || null
        : customer?.profilePicUrl || conv.contact?.profilePicUrl || null;

      return {
        id: conv.id,
        ticketId: conv.id,
        contactName: isGroup ? conv.subject || groupMetadata?.groupName || "Grupo" : (customer?.name || conv.subject || "Usuario"),
        contactPhone: customer?.phone || conv.channelId || "",
        avatarUrl: resolvedAvatarUrl,
        profilePicUrl: resolvedProfilePicUrl,
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
      const ticket = await ticketSyncService.findByIdWithCreator(id, companyId);
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

      // [GROUP] Group system events (joins/leaves/subject changes) and protocol
      // messages have no real text body — they were stored as placeholders. Render
      // them as centered "system" events instead of participant chat bubbles, so a
      // group no longer looks like everyone is sending "[Mensaje]".
      const isPlaceholder =
        !att &&
        (msg.content === "[Mensaje]" || msg.content === "[Sistema/Protocolo]");

      if ((metadata as { system?: boolean }).system === true) {
        senderRole = "system";
      } else if (conversation.isGroup && isPlaceholder) {
        senderRole = "system";
      } else if (msg.direction === "OUTBOUND") {
        senderRole = "agent";
      } else if ((msg.sender as { role?: string })?.role === "SYSTEM") {
        senderRole = "system";
      }

      return {
        ...msg,
        ticketId: msg.conversationId, // [SEC] Compatibility with Frontend Message interface
        timestamp: msg.createdAt, // [SEC] Compatibility with Frontend Message interface
        attachment: att,
        sender: senderRole,
        // [Baileys 7] For group messages, metadata.senderName carries the pushName stored at
        // ingest time and is always more current than the User DB name (which may be stale).
        senderName: (conversation.isGroup && senderRole !== "agent"
          ? (metadata as Record<string, unknown>).senderName as string | undefined
          : undefined) ||
          (msg.sender as { name?: string })?.name || "Usuario",
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
    // [SEC] JID HARDENING: Use central utility for target JID
    const targetJid = WhatsAppIdUtils.getTargetJid(conversation.channelId || "");
    const cleanChannelId = WhatsAppIdUtils.cleanChannelId(targetJid);
    
    const hasValidPhone = cleanChannelId && (conversation.isGroup || /^\d{5,15}$/.test(cleanChannelId));

    if (messagesWithProps.length < CONTEXT_SYNC_THRESHOLD && hasValidPhone) {
      this.triggerContextSync(companyId, conversation.id, targetJid);
    }

    if (conversation.isGroup) {
      const gMeta = conversation.groupMetadata as { groupName?: string; groupPicUrl?: string } | null;
      if (!gMeta || !gMeta.groupPicUrl || !gMeta.groupName || gMeta.groupName === "Grupo Histórico" || conversation.subject.includes("Grupo Histórico")) {
        this.triggerGroupHeal(companyId, conversation.channelId);
      }
    }

    // [ENTERPRISE] PROFILE PICTURE HEAL: If the customer has no profile picture,
    // proactively fetch it from WhatsApp. This covers contacts created via history sync
    // (where ProfilePictureService.fetchAndPersist is never called).
    if (!conversation.isGroup) {
      const customer = conversation.participants?.find(
        (p: { role?: string; phone?: string | null; profilePicUrl?: string | null }) =>
          p.role === "USER" || p.phone === conversation.channelId
      );
      const contactPic = conversation.contact?.profilePicUrl;
      const customerPic = (customer as { profilePicUrl?: string | null } | undefined)?.profilePicUrl;

      if (!contactPic && !customerPic && customer) {
        const customerId = (customer as { id: string }).id;
        this.triggerProfilePicHeal(companyId, conversation.channelId, customerId);
      }
    }

    return {
      ...conversation,
      tags: resolvedTags,
      messages: messagesWithProps,
    } as unknown as ConversationWithRelations;
  }

  private triggerContextSync(companyId: string, conversationId: string, phone: string) {
    import("./ChatSyncService").then(({ chatSyncService }) => {
      chatSyncService.contextSync(companyId, conversationId, WhatsAppIdUtils.getTargetJid(phone)).catch((err: Error) =>
        Logger.warn(`[QueryService] Context sync failed:`, { error: err.message }),
      );
    });
  }

  private triggerGroupHeal(companyId: string, channelId: string) {
    const groupJid = channelId.includes("@g.us") ? channelId : `${channelId}@g.us`;
    import("@/whatsapp").then(({ whatsappService }) => {
      whatsappService.getSessionManager().findActiveSessionForCompany(companyId).then((session) => {
        if (session) {
          import("./queue/groupContactIndexer").then(({ groupContactIndexer }) => {
            groupContactIndexer.queueGroupForIndexing(companyId, groupJid, session.sessionId).catch((err: Error) =>
              Logger.warn(`[QueryService] Failed to queue group heal:`, { error: err.message })
            );
          });
        }
      });
    }).catch(() => {});
  }

  /**
   * [ENTERPRISE] Proactively fetch a WhatsApp profile picture for a contact
   * that was created via history sync and never had its picture fetched.
   * Fire-and-forget — errors are silently logged.
   */
  private triggerProfilePicHeal(companyId: string, channelId: string, userId: string) {
    import("@/whatsapp").then(({ whatsappService }) => {
      whatsappService.getSessionManager().findActiveSessionForCompany(companyId).then((session) => {
        if (!session) return;
        const jid = WhatsAppIdUtils.getTargetJid(channelId);
        import("@/whatsapp/services/ProfilePictureService").then(({ ProfilePictureService }) => {
          const profilePicService = new ProfilePictureService(whatsappService.getSessionManager());
          profilePicService.fetchAndPersist(session.sessionId, jid, userId, companyId).catch((err: Error) =>
            Logger.warn(`[QueryService] Profile pic heal failed for ${channelId}:`, { error: err.message })
          );
        });
      });
    }).catch(() => {});
  }
}

export const conversationQueryService = new ConversationQueryService();
