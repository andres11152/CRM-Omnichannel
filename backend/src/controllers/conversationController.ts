import { Response } from "express";
import { catchAsync } from "@/utils/catchAsync";
import { AppError } from "@/utils/AppError";
import { AuthenticatedRequest, Channel } from "@/types/types";
import { conversationService } from "@/services/ConversationService";
import { Logger } from "@/utils/logger";
import { WhatsAppIdUtils } from "@/whatsapp/utils/WhatsAppIdUtils";

export const createConversation = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const { phone, name, message, addToContacts } = req.body;

    if (!phone) throw new AppError("Phone number is required", 400);
    if (!req.companyId || !req.user) throw new AppError("Not authorized", 401);

    const conversation = await conversationService.createConversation({
      companyId: req.companyId,
      agentId: req.user.id,
      phone,
      name,
      message,
      addToContacts,
    });

    res.status(201).json({
      status: "success",
      data: {
        conversation: {
          id: conversation.id,
          subject: conversation.subject,
          status: conversation.status,
          lastMessage: conversation.lastMessage || null,
          lastMessageAt: conversation.lastMessageAt || null,
          isGroup: conversation.isGroup,
          tags: conversation.tags,
          contact: conversation.contact
            ? {
                id: conversation.contact.id,
                name: conversation.contact.name,
                phone: conversation.contact.phone,
                profilePicUrl: conversation.contact.profilePicUrl,
              }
            : null,
          messages: conversation.messages || [],
        },
      },
    });
  },
);

export const listConversations = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    if (!req.companyId || !req.user) throw new AppError("Not authorized", 401);

    const conversations = await conversationService.listConversations(
      req.companyId,
      req.user.id,
      req.user.role,
    );

    res.status(200).json({
      status: "success",
      results: conversations.length,
      data: { conversations },
    });
  },
);

export const getConversation = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    if (!req.companyId) throw new AppError("Not authorized", 401);

    const conversation = await conversationService.getConversation(
      req.companyId,
      req.params.id,
    );

    res.status(200).json({
      status: "success",
      data: {
        conversation: {
          id: conversation.id,
          subject: conversation.subject,
          status: conversation.status,
          lastMessage: conversation.lastMessage || null,
          lastMessageAt: conversation.lastMessageAt || null,
          isGroup: conversation.isGroup,
          tags: conversation.tags,
          contact: conversation.contact
            ? {
                id: conversation.contact.id,
                name: conversation.contact.name,
                phone: conversation.contact.phone,
                profilePicUrl: conversation.contact.profilePicUrl,
              }
            : null,
          messages: conversation.messages || [],
        },
      },
    });
  },
);

export const replyToConversation = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user || !req.companyId) throw new AppError("Not authorized", 401);

    try {
      const {
        content,
        channel,
        attachment,
        metadata,
        scheduledAt,
        quotedMessageId,
        quotedContent,
      } = req.body;

      Logger.info(`[ConversationController] Replying to ${req.params.id}`, {
        contentSample: (content as string | undefined)?.substring(0, 50),
        hasAttachment: !!attachment,
      });

      // Validate Channel Enum
      let targetChannel: Channel | undefined;
      if (channel && Object.values(Channel).includes(channel as Channel)) {
        targetChannel = channel as Channel;
      }

      const message = await conversationService.replyToConversation({
        companyId: req.companyId,
        userId: req.user.id,
        conversationId: req.params.id,
        content,
        channel: targetChannel,
        attachment,
        metadata,
        scheduledAt,
        quotedMessageId,
        quotedContent,
      });

      res.status(201).json({
        status: "success",
        data: { message },
      });
    } catch (error: unknown) {
      Logger.error("[ConversationController] Reply Failed", error);

      const isError = error instanceof Error;
      const errorMessage = isError ? error.message : "Error desconocido";
      const statusCode = (error as { statusCode?: number })?.statusCode || 500;

      // [SEC] DEBUG: Return full error details
      res.status(statusCode).json({
        status: "error",
        message: errorMessage,
        stack:
          process.env.NODE_ENV === "development" && isError
            ? (error as Error).stack
            : undefined,
        errorRaw: isError
          ? JSON.stringify(error, Object.getOwnPropertyNames(error))
          : JSON.stringify(error),
      });
    }
  },
);

export const updateTags = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    if (!req.companyId) throw new AppError("Not authorized", 401);
    const { tags } = req.body;

    if (!Array.isArray(tags)) throw new AppError("Tags must be an array", 400);

    const conversation = await conversationService.updateTags(
      req.companyId,
      req.params.id,
      tags,
    );

    res.status(200).json({
      status: "success",
      data: { tags: conversation.tags },
    });
  },
);

export const toggleGroupSync = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    if (!req.companyId) throw new AppError("Not authorized", 401);

    const { enabled } = req.body;
    if (typeof enabled !== "boolean") {
      throw new AppError("Enabled must be a boolean", 400);
    }

    const conversation =
      await conversationService.updateSyncEnabled(
        req.companyId,
        req.params.id,
        enabled,
      );

    res.status(200).json({
      status: "success",
      data: {
        syncEnabled: conversation.syncEnabled,
      },
    });
  },
);

export const reactToMessage = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user || !req.companyId) throw new AppError("Not authorized", 401);

    const { id: conversationId, messageId } = req.params;
    const { reaction } = req.body;

    await conversationService.reactToMessage(
      req.companyId,
      conversationId,
      messageId,
      reaction,
      req.user.id,
    );

    res.status(200).json({
      status: "success",
      data: { reaction },
    });
  },
);

export const syncFullHistory = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    if (!req.companyId || !req.user) throw new AppError("Not authorized", 401);

    const { id: conversationId } = req.params;
    
    // 1. Get Conversation to find the real JID/ChannelId
    const conversation = await conversationService.getConversation(req.companyId, conversationId);
    if (!conversation) throw new AppError("Conversation not found", 404);

    // 2. Identify the active session
    const { whatsappService } = await import("@/whatsapp");
    const activeSession = await whatsappService.getSessionManager().findActiveSessionForCompany(req.companyId);
    
    if (!activeSession) {
      throw new AppError("No hay una sesión de WhatsApp activa para sincronizar.", 400);
    }

    // 3. Trigger Sync via ChatSyncService
    const { chatSyncService } = await import("@/services/ChatSyncService");
    
    // [SEC] JID HARDENING: Use central utility for consistent domain suffixing
    const targetJid = WhatsAppIdUtils.getTargetJid(conversation.channelId);

    const result = await chatSyncService.syncMessages({
      companyId: req.companyId,
      sessionId: activeSession.sessionId,
      conversationId: targetJid,
      limit: 100, // Default to 100 messages for manual sync
      dryRun: false
    }, req.user.id);

    res.status(200).json({
      status: "success",
      data: {
        newMessages: result.messagesNew,
        duplicates: result.messagesDuplicate,
        errors: result.errors
      }
    });
  }
);

export const retryMediaDownload = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    if (!req.companyId) throw new AppError("Not authorized", 401);

    const { messageId } = req.params;

    const { syncMediaService } = await import("@/services/sync/SyncMediaService");

    const result = await syncMediaService.retryMedia(req.companyId, messageId);

    res.status(200).json({
      status: "success",
      data: result,
    });
  }
);
