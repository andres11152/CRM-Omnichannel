import { whatsappMessagingService, SendMessageOptions } from "@/whatsapp";
import { WhatsAppIdUtils } from "@/whatsapp/utils/WhatsAppIdUtils";
import { gateway } from "@/gateways/socketGateway";
import { AppError } from "@/utils/AppError";
import { Logger } from "@/utils/logger";

import {
  Channel,
  Message,
  MessageDirection,
  Prisma,
} from "@prisma/client";
import {
  ReplyDTO,
  Attachment,
  Metadata,
} from "@/types/conversation.types";

// Repositories
import { messageRepository } from "@/repositories/MessageRepository";
import { conversationRepository } from "@/repositories/ConversationRepository";
import { reactionRepository } from "@/repositories/ReactionRepository";
import { ticketRepository } from "@/repositories/TicketRepository";
import { ticketSyncService } from "./TicketSyncService";

// Instagram
import { instagramSessionRepository } from "@/instagram/InstagramSessionRepository";
import { instagramProviderService, InstagramMediaContent } from "@/instagram/InstagramProviderService";

// Email
import { emailService } from "@/services/email/emailService";
import { emailRepository } from "@/repositories/EmailRepository";
import { companySettingsService } from "@/services/CompanySettingsService";

import { SocketEventEmitter } from "@/services/SocketEventEmitter";
import { ConversationQueryService } from "@/services/ConversationQueryService";

export class ConversationMessageService {
  private socketEmitter = new SocketEventEmitter(gateway);
  private conversationQueryService = new ConversationQueryService();

  /**
   * Primary Messaging Orchestrator (Reply from Agent)
   */
  async replyToConversation(
    dto: ReplyDTO,
  ): Promise<Message | { id: string; content: string; timestamp?: Date; status?: string, sender?: string; metadata?: unknown; type?: string; mediaUrl?: string }> {
    const {
      companyId,
      userId,
      conversationId,
      content,
      channel,
      attachment,
      metadata,
      scheduledAt,
      quotedMessageId,
      quotedContent,
    } = dto;

    // A. Resolve Conversation (Direct or via Ticket fallback) - Optimized to be lightweight
    let resolvedConv = await conversationRepository.findFirst({
      where: { id: conversationId, companyId },
      include: { contact: true },
    });
    if (!resolvedConv) {
      const ticketConvId = await ticketSyncService.findConversationIdByTicket(conversationId, companyId);
      if (ticketConvId) {
        resolvedConv = await conversationRepository.findFirst({
          where: { id: ticketConvId, companyId },
          include: { contact: true },
        });
      }
    }

    if (!resolvedConv || resolvedConv.companyId !== companyId) {
      throw new AppError("Conversation not found", 404);
    }

    const messageContent = content || "";

    // B. Handle Scheduling (channel-agnostic: just persists a SCHEDULED row;
    // the scheduled-send cron currently only dispatches WhatsApp — see plan notes)
    if (scheduledAt) {
      const safeMetadata: Metadata = {
        ...(metadata || {}),
        scheduledAt: typeof scheduledAt === "string" ? scheduledAt : scheduledAt.toISOString(),
        attachment,
        quotedMessageId,
        quotedContent,
        type: attachment ? attachment.type : "text",
        mediaUrl: attachment ? attachment.url : undefined,
      };

      return await messageRepository.create({
        data: {
          companyId,
          conversationId: resolvedConv.id,
          content: messageContent,
          direction: "OUTBOUND",
          senderId: userId,
          channel: channel || resolvedConv.channel,
          status: "SCHEDULED",
          metadata: safeMetadata as Prisma.InputJsonValue,
        },
      });
    }

    // C1. Handle Whispering (bypass WhatsApp/Instagram send)
    if (metadata?.isWhisper === true) {
      const savedMessage = await messageRepository.create({
        data: {
          companyId,
          conversationId: resolvedConv.id,
          content: messageContent,
          direction: "OUTBOUND",
          senderId: userId,
          channel: resolvedConv.channel,
          status: "SENT",
          metadata: {
            ...metadata,
            attachment,
            type: attachment ? attachment.type : "text",
            mediaUrl: attachment ? attachment.url : undefined,
          } as Prisma.InputJsonValue,
        },
        include: {
          sender: true,
        }
      });

      // Get conversation with participants for socket update
      const convWithRels = await conversationRepository.findFirst({
        where: { id: resolvedConv.id, companyId },
        include: {
          participants: true,
          assignedTo: true,
          contact: true,
          messages: {
            orderBy: { createdAt: "desc" },
            take: 1,
          }
        }
      });

      if (convWithRels) {
        const { SocketEventEmitter } = await import("./SocketEventEmitter");
        const socketEmitter = new SocketEventEmitter(gateway);
        
        const ticket = await ticketRepository.findFirst({
          where: { conversationId: resolvedConv.id, status: { in: ["OPEN", "IN_PROGRESS"] } }
        }, companyId);
        
        socketEmitter.emitMessageSent(savedMessage, convWithRels, ticket?.id || resolvedConv.id);
      }

      return {
        id: savedMessage.id,
        content: savedMessage.content,
        timestamp: savedMessage.createdAt,
        status: "SENT",
        sender: "agent",
        metadata: savedMessage.metadata,
        type: attachment ? attachment.type : "text",
        mediaUrl: attachment ? attachment.url : undefined,
      };
    }

    // C. Channel routing: Instagram DMs never go through the WhatsApp JID
    // resolution / whatsappMessagingService path below.
    if (resolvedConv.channel === Channel.INSTAGRAM_DM) {
      return this.replyToInstagram(companyId, userId, resolvedConv.id, resolvedConv.channelId, messageContent, attachment, metadata, quotedMessageId, quotedContent);
    }

    // C2. Email replies go out via the company's SMTP, not Baileys.
    if (resolvedConv.channel === Channel.EMAIL) {
      return this.replyToEmail(companyId, userId, resolvedConv.id, resolvedConv.channelId, resolvedConv.subject, resolvedConv.contact?.email || null, messageContent, metadata);
    }

    // D. Determine Destination Phone / JID (WhatsApp only)
    // For groups: channelId is the group ID (e.g. 120363408109782390) which needs @g.us
    // For DMs: channelId is the phone number (e.g. 573138081081) which needs @s.whatsapp.net
    const initialTargetJid = WhatsAppIdUtils.getTargetJid(resolvedConv.channelId);
    const isGroup = resolvedConv.isGroup || initialTargetJid.endsWith("@g.us");
    let targetPhone = resolvedConv.channelId;

    if (!isGroup) {
      // Only for DMs: try to resolve a clean phone number if channelId is not one
      const isCleanPhone = !!(targetPhone && /^\d+$/.test(targetPhone.replace("@s.whatsapp.net", "")));

      if (!isCleanPhone) {
        // Priority 1: Use linked contact phone
        if (resolvedConv.contact?.phone) {
          targetPhone = resolvedConv.contact.phone;
        } else {
          // Priority 2: Fallback to ticket search
          targetPhone = (await ticketSyncService.findPhoneByConversation(companyId, resolvedConv.id)) || null;
        }
      }
    }

    if (!targetPhone || targetPhone.length < 5) {
      throw new AppError("No se pudo determinar el numero de teléfono del destinatario.", 400);
    }

    // [SEC] CRITICAL FIX: Use WhatsAppIdUtils to construct proper JID
    // Groups: 120363408109782390 → 120363408109782390@g.us
    // DMs:    573138081081       → 573138081081@s.whatsapp.net
    targetPhone = WhatsAppIdUtils.getTargetJid(targetPhone);

    const isAudio = attachment?.type === "audio";

    // E. Direct Send (WhatsApp)
    const options: SendMessageOptions = {
      companyId,
      conversationId: resolvedConv.id,
      senderId: userId,
      media: attachment ? {
        type: attachment.type,
        url: attachment.url,
        mimetype: attachment.mimetype || attachment.mimeType || "application/octet-stream",
        filename: attachment.name,
        caption: content || undefined,
        location: attachment.type === "location" ? {
          latitude: Number(attachment.latitude),
          longitude: Number(attachment.longitude),
          name: (attachment.locationName as string | undefined) || attachment.name,
          address: attachment.address as string | undefined,
        } : undefined,
        contact: attachment.type === "contact" ? {
          name: (attachment.contactName as string | undefined) || attachment.name,
          phone: String(attachment.phone || ""),
        } : undefined,
      } : undefined,
      metadata: { 
        ...metadata, 
        quotedMessageId, 
        quotedContent, 
        attachment, 
        type: attachment ? attachment.type : "text", 
        mediaUrl: attachment ? attachment.url : undefined 
      },
      quotedMessageId,
    };

    const sent = await whatsappMessagingService.sendMessage(targetPhone, messageContent, options);

    return {
      id: sent.dbId || sent.messageId,
      content: sent.content,
      timestamp: sent.timestamp,
      status: "SENT",
      sender: "agent",
      metadata: {
        ...(sent.metadata || {}),
        attachment,
        type: attachment ? attachment.type : "text",
        mediaUrl: attachment ? attachment.url : undefined,
      },
      type: attachment ? attachment.type : "text",
      mediaUrl: attachment ? attachment.url : undefined,
    };
  }

  /**
   * Instagram DM send path (Reply from Agent).
   * Mirrors the shape of the WhatsApp direct-send branch above, but routes
   * through the Instagram Messaging API instead of Baileys/Meta WhatsApp.
   */
  private async replyToInstagram(
    companyId: string,
    userId: string,
    conversationId: string,
    igsid: string | null,
    messageContent: string,
    attachment: Attachment | undefined,
    metadata: Metadata | undefined,
    quotedMessageId: string | undefined,
    quotedContent: string | undefined,
  ): Promise<{ id: string; content: string; timestamp?: Date; status?: string; sender?: string; metadata?: unknown; type?: string; mediaUrl?: string }> {
    if (!igsid) {
      throw new AppError("No se pudo determinar el destinatario de Instagram.", 400);
    }

    const sessions = await instagramSessionRepository.findByCompany(companyId);
    const session = sessions.find((s) => s.status === "CONNECTED") || sessions[0];
    if (!session) {
      throw new AppError("No hay una sesión de Instagram conectada para esta empresa.", 400);
    }

    const mediaContent: InstagramMediaContent | null = attachment
      ? { type: attachment.type === "document" ? "file" : (attachment.type as "image" | "video" | "audio"), url: attachment.url }
      : null;

    const sendResult = await instagramProviderService.sendMessage(
      session.igBusinessAccountId,
      igsid,
      mediaContent || messageContent,
    );

    const savedMessage = await messageRepository.create({
      data: {
        companyId,
        conversationId,
        content: messageContent,
        direction: "OUTBOUND",
        senderId: userId,
        channel: Channel.INSTAGRAM_DM,
        status: "SENT",
        instagramMessageId: sendResult.messageId,
        metadata: {
          ...metadata,
          quotedMessageId,
          quotedContent,
          attachment,
          type: attachment ? attachment.type : "text",
          mediaUrl: attachment ? attachment.url : undefined,
        } as Prisma.InputJsonValue,
      },
    });

    return {
      id: savedMessage.id,
      content: savedMessage.content,
      timestamp: savedMessage.createdAt,
      status: "SENT",
      sender: "agent",
      metadata: savedMessage.metadata,
      type: attachment ? attachment.type : "text",
      mediaUrl: attachment ? attachment.url : undefined,
    };
  }

  /**
   * Single-purpose message sender (Internal & Notifications)
   */
  async sendMessageToWhatsApp(
    companyId: string,
    conversationId: string,
    senderId: string,
    phone: string,
    content: string,
    attachment?: Attachment,
    metadata?: Metadata,
  ): Promise<void> {
    const options: SendMessageOptions = {
      companyId,
      conversationId,
      senderId,
      media: attachment ? {
        type: attachment.type,
        url: attachment.url,
        mimetype: attachment.mimetype || attachment.mimeType || "application/octet-stream",
        filename: attachment.name,
        caption: content || undefined,
      } : undefined,
      metadata,
    };

    try {
      await whatsappMessagingService.sendMessage(phone, content, options);
    } catch (e: unknown) {
      Logger.error("[MessageService] Failed to send notification", e);
      const failedMsg = await messageRepository.create({
        data: {
          companyId,
          conversationId,
          content,
          direction: "OUTBOUND",
          senderId,
          channel: "WHATSAPP",
          status: "FAILED",
          metadata: metadata as Prisma.InputJsonValue,
        },
      });

      gateway.emitToCompany(companyId, "message:new", {
        conversationId,
        message: failedMsg,
      });
    }
  }

  async reactToMessage(
    companyId: string,
    conversationId: string,
    messageId: string,
    reaction: string,
    userId: string,
  ): Promise<void> {
    const conv = await conversationRepository.findByIdAndCompanyId(conversationId, companyId);
    if (!conv) {
      const ticketConvId = await ticketSyncService.findConversationIdByTicket(conversationId, companyId);
      if (ticketConvId) {
        const resolved = await conversationRepository.findByIdAndCompanyId(ticketConvId, companyId);
        if (resolved) {
          await this.reactToMessage(companyId, resolved.id, messageId, reaction, userId);
          return;
        }
      }
      throw new AppError("Conversation not found", 404);
    }

    const msg = await messageRepository.findFirst({
      where: { id: messageId, companyId },
    });
    if (!msg || !msg.whatsappMessageId) throw new AppError("Message not found", 404);

    let targetPhone = conv.channelId;
    if (!targetPhone || !/^\d+$/.test(targetPhone)) {
      targetPhone = (await ticketSyncService.findPhoneByConversation(companyId, conv.id)) || null;
    }

    if (!targetPhone) throw new AppError("Target phone not found", 400);

    // 1. Send to WhatsApp (with proper origin tracking for reactions)
    const fromMe = msg.direction === MessageDirection.OUTBOUND;
    await whatsappMessagingService.sendReaction(targetPhone, msg.whatsappMessageId, reaction, companyId, fromMe);

    // 2. Local DB
    if (!reaction) {
      await reactionRepository.removeReaction(msg.id, userId, companyId);
    } else {
      await reactionRepository.upsertReaction({
        messageId: msg.id,
        reactBy: userId,
        content: reaction,
        companyId,
      });
    }

    // 3. Socket
    gateway.emitToCompany(companyId, "message:reaction", {
      messageId: msg.id,
      conversationId: conv.id,
      reaction,
      reactBy: userId,
    });
  }

  /** Resolves a conversationId param that may actually be a ticket id (same
   * fallback used by reactToMessage/replyToConversation). */
  private async resolveConversation(companyId: string, conversationId: string) {
    const conv = await conversationRepository.findByIdAndCompanyId(conversationId, companyId);
    if (conv) return conv;

    const ticketConvId = await ticketSyncService.findConversationIdByTicket(conversationId, companyId);
    if (ticketConvId) {
      const resolved = await conversationRepository.findByIdAndCompanyId(ticketConvId, companyId);
      if (resolved) return resolved;
    }
    throw new AppError("Conversation not found", 404);
  }

  private async resolveTargetPhone(companyId: string, conv: { id: string; channelId: string | null }): Promise<string> {
    let targetPhone = conv.channelId;
    if (!targetPhone || !/^\d+$/.test(targetPhone)) {
      targetPhone = (await ticketSyncService.findPhoneByConversation(companyId, conv.id)) || null;
    }
    if (!targetPhone) throw new AppError("Target phone not found", 400);
    return targetPhone;
  }

  /** Builds Baileys' required `lastMessages` for the `archive` chatModify —
   * `key.remoteJid` is left unset; OutboundMessageHandler.modifyChat fills it
   * in once it resolves the destination JID. */
  private async buildLastMessages(companyId: string, conversationId: string) {
    const lastMsg = await messageRepository.findFirst({
      where: { conversationId, companyId },
      orderBy: { createdAt: "desc" },
    });
    if (!lastMsg || !lastMsg.whatsappMessageId) return [];
    return [
      {
        key: {
          id: lastMsg.whatsappMessageId,
          fromMe: lastMsg.direction === MessageDirection.OUTBOUND,
        },
        messageTimestamp: Math.floor(lastMsg.createdAt.getTime() / 1000),
      },
    ];
  }

  async setArchived(
    companyId: string,
    conversationId: string,
    archived: boolean,
  ): Promise<{ isArchived: boolean; whatsappSynced: boolean }> {
    const conv = await this.resolveConversation(companyId, conversationId);
    const targetPhone = await this.resolveTargetPhone(companyId, conv);
    const lastMessages = await this.buildLastMessages(companyId, conv.id);

    let whatsappSynced = true;
    try {
      await whatsappMessagingService.modifyChat(targetPhone, companyId, {
        archive: archived,
        lastMessages,
      });
    } catch (error) {
      whatsappSynced = false;
      Logger.warn(
        `[ConversationMessageService] WhatsApp archive sync failed for conversation ${conv.id}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    await conversationRepository.update(companyId, conv.id, { isArchived: archived });
    gateway.emitToCompany(companyId, "conversation:updated", {
      conversationId: conv.id,
      isArchived: archived,
    });

    return { isArchived: archived, whatsappSynced };
  }

  async setPinned(
    companyId: string,
    conversationId: string,
    pinned: boolean,
  ): Promise<{ isPinned: boolean; whatsappSynced: boolean }> {
    const conv = await this.resolveConversation(companyId, conversationId);
    const targetPhone = await this.resolveTargetPhone(companyId, conv);

    let whatsappSynced = true;
    try {
      await whatsappMessagingService.modifyChat(targetPhone, companyId, { pin: pinned });
    } catch (error) {
      whatsappSynced = false;
      Logger.warn(
        `[ConversationMessageService] WhatsApp pin sync failed for conversation ${conv.id}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    await conversationRepository.update(companyId, conv.id, { isPinned: pinned });
    gateway.emitToCompany(companyId, "conversation:updated", {
      conversationId: conv.id,
      isPinned: pinned,
    });

    return { isPinned: pinned, whatsappSynced };
  }

  async setMuted(
    companyId: string,
    conversationId: string,
    mutedUntil: Date | null,
  ): Promise<{ mutedUntil: Date | null; whatsappSynced: boolean }> {
    const conv = await this.resolveConversation(companyId, conversationId);
    const targetPhone = await this.resolveTargetPhone(companyId, conv);

    let whatsappSynced = true;
    try {
      await whatsappMessagingService.modifyChat(targetPhone, companyId, {
        mute: mutedUntil ? mutedUntil.getTime() : null,
      });
    } catch (error) {
      whatsappSynced = false;
      Logger.warn(
        `[ConversationMessageService] WhatsApp mute sync failed for conversation ${conv.id}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    await conversationRepository.update(companyId, conv.id, { mutedUntil });
    gateway.emitToCompany(companyId, "conversation:updated", {
      conversationId: conv.id,
      mutedUntil,
    });

    return { mutedUntil, whatsappSynced };
  }

  /**
   * Edit an already-sent OUTBOUND message. Baileys/WhatsApp only allow
   * editing messages the account itself sent — INBOUND (customer) messages
   * or messages missing a whatsappMessageId (never actually delivered) are
   * rejected before ever reaching the socket. Mirrors the metadata shape
   * MessageEditHandler.ts already uses for the inbound case (customer edits
   * their own message) so both paths converge on one frontend contract.
   */
  async editMessage(
    companyId: string,
    conversationId: string,
    messageId: string,
    newContent: string,
  ): Promise<Message> {
    const conv = await this.resolveConversation(companyId, conversationId);
    const msg = await messageRepository.findFirst({
      where: { id: messageId, companyId, conversationId: conv.id },
    });
    if (!msg) throw new AppError("Message not found", 404);
    if (msg.direction !== MessageDirection.OUTBOUND || !msg.whatsappMessageId) {
      throw new AppError("Only your own delivered WhatsApp messages can be edited", 400);
    }
    if (msg.status === "REVOKED") {
      throw new AppError("Cannot edit a deleted message", 400);
    }

    const targetPhone = await this.resolveTargetPhone(companyId, conv);
    await whatsappMessagingService.editMessage(targetPhone, msg.whatsappMessageId, newContent, companyId);

    const existingMeta = (msg.metadata as Record<string, unknown>) || {};
    await messageRepository.update(
      msg.id,
      {
        content: newContent,
        metadata: { ...existingMeta, isEdited: true, editedAt: new Date().toISOString() },
      },
      companyId,
    );
    const updated = await messageRepository.findFirst({
      where: { id: msg.id, companyId },
      include: { sender: true },
    });
    if (!updated) throw new AppError("Message not found after update", 500);

    const fullConv = await this.conversationQueryService.getConversation(companyId, conv.id);
    const ticketId = fullConv.contact?.id || "";
    this.socketEmitter.emitMessageSent(updated, fullConv, ticketId);

    return updated;
  }

  /** Delete-for-everyone on an already-sent OUTBOUND message. Reuses the exact
   * content placeholder / status / metadata shape MessageRevocationHandler.ts
   * already uses for the inbound case (contact deletes their own message), so
   * both paths render identically in the UI regardless of who deleted it. */
  async revokeMessage(
    companyId: string,
    conversationId: string,
    messageId: string,
  ): Promise<Message> {
    const conv = await this.resolveConversation(companyId, conversationId);
    const msg = await messageRepository.findFirst({
      where: { id: messageId, companyId, conversationId: conv.id },
    });
    if (!msg) throw new AppError("Message not found", 404);
    if (msg.direction !== MessageDirection.OUTBOUND || !msg.whatsappMessageId) {
      throw new AppError("Only your own delivered WhatsApp messages can be deleted", 400);
    }
    if (msg.status === "REVOKED") {
      throw new AppError("Message already deleted", 400);
    }

    const targetPhone = await this.resolveTargetPhone(companyId, conv);
    await whatsappMessagingService.revokeMessage(targetPhone, msg.whatsappMessageId, companyId);

    const existingMeta = (msg.metadata as Record<string, unknown>) || {};
    const updated = await messageRepository.update(
      msg.id,
      {
        content: " Este mensaje fue eliminado",
        status: "REVOKED",
        metadata: {
          ...existingMeta,
          revoked: true,
          revokedAt: new Date().toISOString(),
          revokedBy: "sender",
        },
      },
      companyId,
    );

    this.socketEmitter.emitMessageRevoked(msg.id, conv.id, companyId);

    return updated;
  }

  /** Star/unstar a message (any direction — WhatsApp lets you star messages
   * you received too, not just your own). Starred state is tracked in
   * `metadata.starred`, matching the metadata-based convention already used
   * for isEdited/revoked rather than adding a dedicated column. */
  async setStarred(
    companyId: string,
    conversationId: string,
    messageId: string,
    starred: boolean,
  ): Promise<{ starred: boolean; whatsappSynced: boolean }> {
    const conv = await this.resolveConversation(companyId, conversationId);
    const msg = await messageRepository.findFirst({
      where: { id: messageId, companyId, conversationId: conv.id },
    });
    if (!msg) throw new AppError("Message not found", 404);
    if (!msg.whatsappMessageId) {
      throw new AppError("Message was never delivered/received via WhatsApp", 400);
    }

    let whatsappSynced = true;
    try {
      const targetPhone = await this.resolveTargetPhone(companyId, conv);
      await whatsappMessagingService.modifyChat(targetPhone, companyId, {
        star: {
          messages: [
            { id: msg.whatsappMessageId, fromMe: msg.direction === MessageDirection.OUTBOUND },
          ],
          star: starred,
        },
      });
    } catch (error) {
      whatsappSynced = false;
      Logger.warn(
        `[ConversationMessageService] WhatsApp star sync failed for message ${msg.id}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    const existingMeta = (msg.metadata as Record<string, unknown>) || {};
    await messageRepository.update(
      msg.id,
      { metadata: { ...existingMeta, starred } },
      companyId,
    );

    gateway.emitToCompany(companyId, "message:starred", {
      messageId: msg.id,
      conversationId: conv.id,
      starred,
    });

    return { starred, whatsappSynced };
  }

  /** Pin/unpin a message "for everyone" — the banner-at-top feature. WhatsApp
   * only supports ONE pinned message per chat, so pinning a new one first
   * clears the isPinned flag off any previously-pinned message in the same
   * conversation. Mirrors the metadata shape used by the inbound pin handler
   * (StatusUpdateHandler.handlePinEvent) so both paths render identically. */
  async pinMessage(
    companyId: string,
    conversationId: string,
    messageId: string,
    pin: boolean,
  ): Promise<{ isPinned: boolean; whatsappSynced: boolean }> {
    const conv = await this.resolveConversation(companyId, conversationId);
    const msg = await messageRepository.findFirst({
      where: { id: messageId, companyId, conversationId: conv.id },
    });
    if (!msg) throw new AppError("Message not found", 404);
    if (!msg.whatsappMessageId) {
      throw new AppError("Message was never delivered/received via WhatsApp", 400);
    }

    const fromMe = msg.direction === MessageDirection.OUTBOUND;
    let whatsappSynced = true;
    try {
      const targetPhone = await this.resolveTargetPhone(companyId, conv);
      await whatsappMessagingService.pinMessage(targetPhone, msg.whatsappMessageId, fromMe, pin, companyId);
    } catch (error) {
      whatsappSynced = false;
      Logger.warn(
        `[ConversationMessageService] WhatsApp pin sync failed for message ${msg.id}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    // WhatsApp = one pinned message per chat: clear any prior pin first.
    if (pin) {
      const prevPinned = await messageRepository.findMany({
        where: {
          companyId,
          conversationId: conv.id,
          id: { not: msg.id },
          metadata: { path: ["isPinned"], equals: true },
        },
      });
      for (const prev of prevPinned) {
        const prevMeta = (prev.metadata as Record<string, unknown>) || {};
        await messageRepository.update(
          prev.id,
          { metadata: { ...prevMeta, isPinned: false, pinnedAt: null } },
          companyId,
        );
      }
    }

    const existingMeta = (msg.metadata as Record<string, unknown>) || {};
    await messageRepository.update(
      msg.id,
      {
        metadata: {
          ...existingMeta,
          isPinned: pin,
          pinnedAt: pin ? new Date().toISOString() : null,
        },
      },
      companyId,
    );

    this.socketEmitter.emitMessagePinned(
      msg.id,
      conv.id,
      companyId,
      pin,
      msg.content || "",
      msg.senderId || "",
    );

    return { isPinned: pin, whatsappSynced };
  }
}

export const conversationMessageService = new ConversationMessageService();
