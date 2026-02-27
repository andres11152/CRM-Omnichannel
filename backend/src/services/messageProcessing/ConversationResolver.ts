import { Conversation, Prisma } from "@prisma/client";
import { prisma } from "@/config/database";
import { conversationRepository } from "@/repositories/ConversationRepository";
import { Logger } from "@/utils/logger";
import type { IdentityResult } from "@/utils/contactStrategy";
import type { ConversationWithQueue } from "@/types/message.types";

/**
 * 🛡️ TYPE GUARD
 */
function isPrismaError(
  error: unknown,
): error is Prisma.PrismaClientKnownRequestError {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    "clientVersion" in error
  );
}

export interface ConversationResolverParams {
  companyId: string;
  phone: string;
  identity: IdentityResult;
  isOutbound: boolean;
  sessionId: string;
  contactId?: string;
  userId: string;
  originalLid?: string;
}

/**
 * 💬 CONVERSATION RESOLVER
 *
 * Single Responsibility: Finds or creates a Conversation (and Ticket) for a message.
 * Handles LID migration, channelId normalization, and conversation re-opening.
 */
export class ConversationResolver {
  /**
   * Resolves the conversation for a given phone/company.
   * Creates a new conversation + ticket if none exists.
   */
  async resolve(
    params: ConversationResolverParams,
  ): Promise<ConversationWithQueue> {
    const {
      companyId,
      phone,
      identity,
      isOutbound,
      sessionId,
      contactId,
      userId,
      originalLid,
    } = params;

    // 1. PRIMARY LOOKUP: Search by normalized phone
    let conversation = await conversationRepository.findFirst({
      where: { companyId, channelId: phone },
      orderBy: { createdAt: "desc" },
    });

    // 2. LEGACY MIGRATION: Check for old LID-based conversation
    if (!conversation && originalLid) {
      conversation = await this.migrateLidConversation(
        companyId,
        phone,
        originalLid,
        identity,
      );
    }

    // 3. FAILSAFE: Search by Contact ID (the "Wrong Number" fix)
    if (!conversation && contactId) {
      conversation = await this.findByContactId(companyId, phone, contactId);
    }

    // 4. CREATE NEW or UPDATE EXISTING
    if (!conversation) {
      conversation = await this.createNew(
        companyId,
        phone,
        identity,
        sessionId,
        contactId,
        userId,
      );
    } else {
      conversation = await this.updateExisting(
        conversation,
        phone,
        identity,
        isOutbound,
        contactId,
      );
    }

    if (!conversation) {
      throw new Error("CRITICAL: Conversation should exist at this point");
    }

    return conversation as ConversationWithQueue;
  }

  // ─── Private Helpers ───────────────────────────────────────────

  private async migrateLidConversation(
    companyId: string,
    phone: string,
    originalLid: string,
    identity: IdentityResult,
  ): Promise<Conversation | null> {
    Logger.info(
      `[ConvResolver] 🔍 Searching for legacy LID conversation: ${originalLid}`,
    );

    const legacyConversation = await conversationRepository.findFirst({
      where: { companyId, channelId: originalLid },
    });

    if (!legacyConversation) return null;

    Logger.info(
      `[ConvResolver] 🔄 MIGRATING LID Conversation: ${originalLid} → ${phone}`,
    );

    try {
      const migrated = await conversationRepository.update(
        legacyConversation.id,
        { channelId: phone, subject: identity.subjectDisplayName },
      );
      Logger.info(`[ConvResolver] ✅ Migration successful: ${migrated.id}`);
      return migrated;
    } catch (error: unknown) {
      if (isPrismaError(error) && error.code === "P2002") {
        Logger.warn(
          `[ConvResolver] ⚠️ Already migrated by another process. Re-fetching...`,
        );
        return conversationRepository.findFirst({
          where: { companyId, channelId: phone },
        });
      }
      throw error;
    }
  }

  private async findByContactId(
    companyId: string,
    phone: string,
    contactId: string,
  ): Promise<Conversation | null> {
    Logger.info(
      `[ConvResolver] 🔍 Failsafe: Searching by Contact ID: ${contactId}`,
    );

    const contactConversation = await conversationRepository.findFirst({
      where: { companyId, contactId },
      orderBy: { updatedAt: "desc" },
    });

    if (!contactConversation) return null;

    if (contactConversation.channelId !== phone) {
      Logger.info(
        `[ConvResolver] 🔄 Migrating channelId: ${contactConversation.channelId} -> ${phone}`,
      );
      try {
        return await conversationRepository.update(contactConversation.id, {});
      } catch (error: unknown) {
        if (isPrismaError(error) && error.code === "P2002") {
          Logger.warn(`[ConvResolver] ⚠️ Migration conflict. Using existing.`);
          return conversationRepository.findFirst({
            where: { companyId, channelId: phone },
          });
        }
        throw error;
      }
    }

    return contactConversation;
  }

  private async createNew(
    companyId: string,
    phone: string,
    identity: IdentityResult,
    sessionId: string,
    contactId: string | undefined,
    userId: string,
  ): Promise<Conversation> {
    Logger.info(`[ConvResolver] 🆕 Creating new conversation for: ${phone}`);

    try {
      let conversation: Conversation | null = null;

      await prisma.$transaction(async (tx) => {
        // Queue Logic (Smart Assignment)
        let queueId: string | null = null;

        // Priority 1: Session's default queue
        if (sessionId) {
          const sessionConfig = await tx.whatsAppSession.findUnique({
            where: { sessionId },
            select: { defaultQueueId: true },
          });
          if (sessionConfig?.defaultQueueId) {
            queueId = sessionConfig.defaultQueueId;
          }
        }

        Logger.info(
          `[ConvResolver] 🎯 Assigned Queue: ${queueId || "None (Manual)"}`,
        );

        // CREATE CONVERSATION
        conversation = await tx.conversation.create({
          data: {
            companyId,
            channelId: phone,
            subject: identity.subjectDisplayName,
            status: "OPEN",
            participants: { connect: [{ id: userId }] },
            contactId,
            queueId,
          },
        });

        // CREATE TICKET
        const lastTicket = await tx.ticket.findFirst({
          where: { companyId },
          orderBy: { ticketNumber: "desc" },
          select: { ticketNumber: true },
        });

        await tx.ticket.create({
          data: {
            companyId,
            ticketNumber: (lastTicket?.ticketNumber || 0) + 1,
            subject: identity.subjectDisplayName,
            description: "Chat iniciado en WhatsApp",
            status: "OPEN",
            priority: "MEDIUM",
            createdById: userId,
            conversationId: conversation.id,
            queueId,
          },
        });

        Logger.info(
          `[ConvResolver] ✅ Conversation created: ${conversation.id}`,
        );
      });

      if (!conversation) {
        throw new Error("Transaction completed but conversation is null");
      }

      return conversation;
    } catch (error: unknown) {
      if (isPrismaError(error) && error.code === "P2002") {
        Logger.warn(
          `[ConvResolver] ⚠️ Created by another process. Re-fetching...`,
        );
        const existing = await conversationRepository.findFirst({
          where: { companyId, channelId: phone },
        });
        if (!existing) {
          throw new Error(
            "Critical: Conversation should exist but not found after P2002",
          );
        }
        return existing;
      }
      throw error;
    }
  }

  private async updateExisting(
    conversation: Conversation,
    phone: string,
    identity: IdentityResult,
    isOutbound: boolean,
    contactId: string | undefined,
  ): Promise<Conversation> {
    Logger.info(
      `[ConvResolver] ♻️ Using existing conversation: ${conversation.id}`,
    );

    const updates: Prisma.ConversationUpdateInput = {};

    // Link contact if missing
    if (!conversation.contactId && contactId) {
      updates.contact = { connect: { id: contactId } };
    }

    // Update subject if generic and we have a better name
    if (!isOutbound && identity.hasValidName && identity.contactName) {
      const isGenericSubject =
        conversation.subject === phone ||
        /^~?\d+$/.test(conversation.subject || "");
      if (isGenericSubject) {
        updates.subject = identity.contactName;
      }
    }

    // Re-open if closed (customer sent new message)
    const isClosed =
      conversation.status === "CLOSED" || conversation.status === "RESOLVED";
    if (isClosed && !isOutbound) {
      updates.status = conversation.assignedToId ? "IN_PROGRESS" : "OPEN";
      Logger.info(
        `[ConvResolver] 🔓 Re-opening conversation as ${updates.status}`,
      );
    }

    if (Object.keys(updates).length > 0) {
      return conversationRepository.update(conversation.id, updates);
    }

    return conversation;
  }
}

export const conversationResolver = new ConversationResolver();
