import { prisma } from "@/config/database";
import { chatService } from "@/services/chatService";
import { generateAIResponse } from "@/services/aiResponseService";
import { flowExecutor } from "@/services/flowExecutor";
import { AIResponseSchema } from "@/types/ai.types";
import { TenantContextManager } from "@/config/tenantContext";
import { WhatsAppIdUtils } from "../utils/WhatsAppIdUtils";
import { Logger } from "@/utils/logger";
import mime from "mime-types";
import { Conversation, Queue, User } from "@prisma/client";

/**
 * 🤖 AI TRIGGER SERVICE
 *
 * Handles AI response generation and Flow Bot execution.
 * Extracted from MessageHandler for SRP compliance.
 *
 * Responsibilities:
 * - Flow Bot message processing
 * - AI assistant response generation
 * - HITL (Human-in-the-Loop) grace period management
 */

type ConversationWithQueue = Conversation & {
  queue: (Queue & { aiAssistantId: string | null }) | null;
  participants: User[];
  assignedTo: User | null;
};

/** Callbacks for sending messages/media back through MessageHandler */
export interface AITriggerCallbacks {
  sendMessage: (
    to: string,
    content: string,
    options: {
      companyId: string;
      conversationId: string;
      senderId: string;
      metadata?: Record<string, unknown>;
    },
  ) => Promise<unknown>;
  sendMedia: (
    to: string,
    media: {
      type: string;
      url: string;
      caption?: string;
      mimetype: string;
    },
    options: {
      companyId: string;
      conversationId: string;
      senderId: string;
      metadata?: Record<string, unknown>;
    },
  ) => Promise<unknown>;
  sendPresenceUpdate: (
    to: string,
    type: "composing" | "recording" | "paused",
    companyId: string,
  ) => Promise<void>;
}

export class AITriggerService {
  constructor(private callbacks: AITriggerCallbacks) {}

  /**
   * Process inbound message through Flow Bot first, then AI if no flow matched.
   * This is the main entry point called from MessageHandler after message persistence.
   *
   * @returns true if a flow was executed (AI should be skipped)
   */
  async processInboundTriggers(
    conversation: ConversationWithQueue,
    textContent: string,
    companyId: string,
    cleanRemoteJid: string,
    customerUser: User | null,
    pushName: string | undefined,
  ): Promise<void> {
    // Step 1: Execute Flow Bot
    const flowExecuted = await this.executeFlowBot(
      conversation,
      textContent,
      companyId,
      cleanRemoteJid,
      customerUser,
      pushName,
    );

    if (flowExecuted) return;

    // Step 2: Check HITL grace period
    const isAiEnabled = conversation.aiEnabled !== false;

    if (!isAiEnabled) {
      const lastIntervention = conversation.lastManualIntervention
        ? new Date(conversation.lastManualIntervention)
        : null;

      const GRACE_PERIOD_MS = 10 * 60 * 1000;
      const timeSinceIntervention = lastIntervention
        ? Date.now() - lastIntervention.getTime()
        : 0;

      if (lastIntervention && timeSinceIntervention < GRACE_PERIOD_MS) {
        return;
      } else {
        await chatService.updateConversation(conversation.id, {
          aiEnabled: true,
        });
      }
    }

    // Step 3: Trigger AI Response
    this.triggerAIResponse(conversation, textContent, companyId).catch(
      () => {},
    );
  }

  /**
   * Execute Flow Bot logic.
   * Finds or creates contact, processes message through flowExecutor,
   * sends responses back through MessageHandler callbacks.
   */
  private async executeFlowBot(
    conversation: ConversationWithQueue,
    textContent: string,
    companyId: string,
    cleanRemoteJid: string,
    customerUser: User | null,
    pushName: string | undefined,
  ): Promise<boolean> {
    const flowPhone =
      customerUser?.phone || WhatsAppIdUtils.getPhoneNumber(cleanRemoteJid);

    if (!flowPhone) return false;

    try {
      let contact = await prisma.contact.findFirst({
        where: { companyId, phone: flowPhone },
      });

      if (!contact) {
        try {
          contact = await prisma.contact.create({
            data: {
              companyId,
              phone: flowPhone,
              name: pushName || "Usuario WhatsApp",
              tags: ["WHATSAPP_LEAD", "AUTO_CREATED"],
            },
          });
        } catch {
          contact = await prisma.contact.findFirst({
            where: { companyId, phone: flowPhone },
          });
        }
      }

      if (!contact) return false;

      const flowResults = await flowExecutor.processMessage(
        contact.id,
        textContent,
        conversation.id,
        companyId,
      );

      if (!flowResults || flowResults.length === 0) return false;

      // Flow matched — send responses
      const botUser = await chatService.upsertWhatsAppUser({
        email: `bot_${companyId}@reply.bot`,
        name: "Flow Bot",
        companyId,
        role: "AGENT",
      });

      await TenantContextManager.run(
        { companyId, userId: botUser.id, requestId: "flow" },
        async () => {
          for (const result of flowResults) {
            if (typeof result === "string") {
              await this.callbacks.sendMessage(conversation.channelId, result, {
                companyId,
                conversationId: conversation.id,
                senderId: botUser.id,
                metadata: { flowGenerated: true },
              });
            } else if (
              result &&
              typeof result === "object" &&
              "type" in result
            ) {
              await this.callbacks.sendMedia(
                conversation.channelId,
                {
                  type: result.type,
                  url: result.url,
                  caption: result.message,
                  mimetype:
                    mime.lookup(result.url) || "application/octet-stream",
                },
                {
                  companyId,
                  conversationId: conversation.id,
                  senderId: botUser.id,
                  metadata: { flowGenerated: true },
                },
              );
            }
          }
        },
      );

      return true;
    } catch (err) {
      Logger.error("[AITrigger] Flow Execution Failed:", err);
      return false;
    }
  }

  /**
   * Trigger AI assistant response.
   * Fetches conversation history, generates response via AI service,
   * simulates typing delay, and sends response.
   */
  private async triggerAIResponse(
    conversation: ConversationWithQueue,
    messageContent: string,
    companyId: string,
  ): Promise<void> {
    if (!conversation?.queue?.aiAssistantId) return;

    // 🛡️ RACE CONDITION GUARD: Prevent double AI response
    // If an AI message was sent in the last 8 seconds for this conversation, skip to avoid spam.
    const recentAiResponse = await prisma.message.findFirst({
      where: {
        conversationId: conversation.id,
        createdAt: { gt: new Date(Date.now() - 8000) },
        metadata: {
          path: ["aiGenerated"],
          equals: true,
        },
      },
    });

    if (recentAiResponse) {
      Logger.warn(
        `[AITrigger] 🛡️ Skipping duplicate AI response for conv ${conversation.id} (recent response found)`,
      );
      return;
    }

    const thinkingTime = Math.floor(Math.random() * 1000) + 1000;
    await new Promise((r) => setTimeout(r, thinkingTime));

    const history = await prisma.message.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: "desc" },
      take: 10,
    });

    const formattedHistory = history.reverse().map((m) => ({
      role: (m.direction === "INBOUND" ? "user" : "model") as "user" | "model",
      parts: m.content,
    }));

    const rawResponse = await generateAIResponse(
      companyId,
      conversation.queue.aiAssistantId,
      messageContent,
      formattedHistory,
    );

    if (!rawResponse) return;

    const validation = AIResponseSchema.safeParse(rawResponse);
    if (!validation.success) return;

    const cleanResponse = validation.data;

    const typingTime = Math.min(
      Math.max(cleanResponse.length * 50, 1500),
      8000,
    );

    await this.callbacks.sendPresenceUpdate(
      conversation.channelId,
      "composing",
      companyId,
    );

    await new Promise((r) => setTimeout(r, typingTime));

    const aiAssistant = await prisma.aIAssistant.findUnique({
      where: { id: conversation.queue.aiAssistantId },
      select: { name: true },
    });
    const botName = aiAssistant?.name || "AI Assistant";

    const botEmail = `ai_${conversation.queue.aiAssistantId}@reply.bot`;
    const botUser = await chatService.upsertWhatsAppUser({
      email: botEmail,
      name: botName,
      companyId,
      role: "AGENT",
    });

    await TenantContextManager.run(
      { companyId, userId: botUser.id, requestId: "ai" },
      async () => {
        await this.callbacks.sendPresenceUpdate(
          conversation.channelId,
          "paused",
          companyId,
        );

        await this.callbacks.sendMessage(
          conversation.channelId,
          cleanResponse,
          {
            companyId,
            conversationId: conversation.id,
            senderId: botUser.id,
            metadata: {
              aiGenerated: true,
              aiAssistantId: conversation.queue!.aiAssistantId,
            },
          },
        );
      },
    );
  }
}
