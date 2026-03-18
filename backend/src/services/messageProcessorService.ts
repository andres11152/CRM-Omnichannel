import { Conversation, Message, User } from "@prisma/client";
import { conversationRepository } from "@/repositories/ConversationRepository";
import { userRepository } from "@/repositories/UserRepository";
import { Logger } from "@/utils/logger";
import { DistributedLock } from "@/utils/distributedLock";
import { ContactStrategy } from "@/utils/contactStrategy";
import { WhatsAppIdUtils } from "@/whatsapp/utils/WhatsAppIdUtils";
import bcrypt from "bcryptjs";
import type { IncomingMessagePayload } from "@/types/message.types";

// 🧩 SRP Sub-Services
import {
  contactResolver,
  userResolver,
  conversationResolver,
  messagePersister,
  flowRunner,
  socketEmitter,
} from "./messageProcessing";

/**
 * 🧠 UTILITY: JID Normalizer
 * Converts messy JIDs (12345:11@s.whatsapp.net) into clean ints (12345)
 */
const normalizeJid = (jid: string): string | null => {
  if (!jid) return null;

  const phone = WhatsAppIdUtils.getPhoneNumber(jid);

  if (!phone) {
    Logger.info(
      `[normalizeJid] ⏩ Rejected: Not a valid phone (LID, group, or invalid): ${jid}`,
    );
    return null;
  }

  if (phone.length < 7 || phone.length > 15) {
    Logger.warn(`[normalizeJid] ⚠️ Rejected: Invalid phone length: ${phone}`);
    return null;
  }

  return phone;
};

/**
 * 🚀 MESSAGE PROCESSOR (ORCHESTRATOR)
 *
 * This module is now a thin orchestrator that delegates each responsibility
 * to a specialized sub-service, following the Single Responsibility Principle:
 *
 *   1. ContactResolver  → Find/create/merge contacts
 *   2. UserResolver     → Upsert shadow WhatsApp users
 *   3. ConversationResolver → Find/create/migrate conversations + tickets
 *   4. MessagePersister → Deduplicate + persist messages
 *   5. FlowRunner       → Execute business flow engine
 *   6. SocketEmitter    → Emit real-time socket events
 *
 * The legacy _handleAIAutoResponse is preserved but disabled.
 * AI execution is handled by the SRP-compliant MessageHandler → AITriggerService pipeline.
 */
export const messageProcessor = {
  /**
   * 🚀 ENTRY POINT
   * Using Distributed Locking to ensure concurrency safety across clusters.
   */
  async process(payload: IncomingMessagePayload) {
    const { remoteJid, companyId, originalLid } = payload;
    const phone = normalizeJid(remoteJid);

    if (!phone) {
      Logger.error(`[MsgProcessor] 🛑 Blocking Message: Unresolved JID/LID`, {
        remoteJid,
        originalLid,
      });
      return;
    }

    const sanitizedPayload = { ...payload, remoteJid: phone };
    const lockKey = `conv:${companyId}:${phone}`;

    try {
      await DistributedLock.run(
        lockKey,
        async () => {
          await this._processSafeInternal(sanitizedPayload);
        },
        5000,
        10000,
      );
    } catch (error) {
      Logger.error(
        `[MsgProcessor] Lock Acquisition Failed or Processing Error`,
        error,
      );
    }
  },

  /**
   * 🔒 CORE LOGIC (Orchestrator)
   * Delegates each step to a specialized sub-service.
   */
  async _processSafeInternal(payload: IncomingMessagePayload) {
    try {
      const {
        companyId,
        sessionId,
        remoteJid: phone,
        text,
        isOutbound,
        hasMedia,
        media,
      } = payload;

      Logger.info(
        `[MsgProcessor] ⚡ Processing ${
          isOutbound ? "OUT" : "IN"
        } | Phone: ${phone}`,
      );

      // 1. RESOLVE IDENTITY
      const identity = ContactStrategy.resolveName(
        phone,
        payload.contactName || payload.senderName,
        isOutbound,
      );

      // 2. RESOLVE CONTACT
      const contact = await contactResolver.resolve({
        companyId,
        phone,
        identity,
        isOutbound,
        originalLid: payload.originalLid,
      });

      // 3. RESOLVE USER
      const user = await userResolver.resolve({
        companyId,
        phone,
        identity,
        isOutbound,
        profilePicUrl: payload.profilePicUrl,
        about: payload.about,
      });

      // 4. RESOLVE CONVERSATION
      const conversation = await conversationResolver.resolve({
        companyId,
        phone,
        identity,
        isOutbound,
        sessionId,
        contactId: contact?.id,
        userId: user.id,
        originalLid: payload.originalLid,
      });

      // 5. PERSIST MESSAGE (with deduplication)
      const newMessage = await messagePersister.persist({
        companyId,
        conversationId: conversation.id,
        text,
        isOutbound,
        senderId: user.id,
        hasMedia,
        media,
        contactId: contact?.id,
      });

      if (!newMessage) return; // Duplicate — skip events

      // 6. EMIT SOCKET EVENTS
      socketEmitter.emit(
        conversation,
        newMessage,
        identity.subjectDisplayName,
        companyId,
        isOutbound,
        user.id,
        user,
      );

      // 7. FLOW ENGINE (Inbound only)
      let flowHandled = false;
      if (!isOutbound) {
        flowHandled = await flowRunner.execute(
          contact.id,
          text,
          conversation.id,
          companyId,
          conversation.channelId,
          user.id,
        );
      }

      // 8. AI (Disabled — handled by MessageHandler → AITriggerService)
      if (!isOutbound && !flowHandled) {
        // Legacy AI trigger disabled to prevent duplicate responses.
        // See AITriggerService for the SRP-compliant implementation.
      }
    } catch (error) {
      Logger.error(`[MsgProcessor] Fatal Error`, error);
    }
  },

  /**
   * 🤖 AI AUTO-RESPONSE HANDLER (Legacy — preserved for backward compatibility)
   * Called by autoAssignmentService.
   */
  async _handleAIAutoResponse(
    conversationId: string,
    inboundMessageId: string,
    userMessage: string,
    companyId: string,
  ) {
    try {
      const conversation = (await conversationRepository.findUnique({
        where: { id: conversationId },
        include: {
          queue: { include: { aiAssistant: true } },
          messages: {
            where: { id: { not: inboundMessageId } },
            orderBy: { createdAt: "desc" },
            take: 10,
            include: { sender: true },
          },
        },
      })) as
        | (Conversation & {
            queue: { aiAssistant: { id: string; name: string } | null } | null;
            messages: (Message & { sender: User | null })[];
          })
        | null;

      if (!conversation?.queue?.aiAssistant) return;

      const aiAssistant = conversation.queue.aiAssistant;
      const history = conversation.messages
        .slice()
        .reverse()
        .map((msg) => ({
          role: (msg.direction === "INBOUND" ? "user" : "model") as
            | "user"
            | "model",
          parts: msg.content,
        }));

      const { generateAIResponse } = await import("./aiResponseService");
      const aiResponseText = await generateAIResponse(
        companyId,
        aiAssistant.id,
        userMessage,
        history,
      );

      if (!aiResponseText) return;

      const botEmail = `ai_${aiAssistant.id}@reply.bot`;
      let botUser = await userRepository.findFirst({
        where: { email: botEmail, companyId },
      });

      if (!botUser) {
        botUser = await userRepository.create({
          data: {
            email: botEmail,
            name: aiAssistant.name,
            password: await bcrypt.hash(aiAssistant.id, 10),
            role: "AGENT",
            companyId,
          },
        });
      }

      const { whatsappService } = await import("../whatsapp");
      await whatsappService.sendMessage(
        conversation.channelId,
        aiResponseText,
        {
          companyId,
          conversationId,
          senderId: botUser.id,
          metadata: {
            aiGenerated: true,
            aiAssistantId: aiAssistant.id,
            aiAssistantName: aiAssistant.name,
          },
        },
      );
    } catch (error) {
      Logger.error(`[AI] Error:`, error);
    }
  },
};
