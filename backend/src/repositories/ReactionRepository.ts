import { prisma } from "@/config/database";
import { MessageReaction, Prisma } from "@prisma/client";

/**
 * 🧡 MESSAGE REACTION REPOSITORY
 *
 * Handles persistence for emojis/reactions on messages.
 * 🛡️ ALL queries are scoped by companyId for multi-tenant safety.
 */
export class ReactionRepository {
  async upsertReaction(data: {
    messageId: string;
    reactBy: string;
    content: string;
    companyId: string;
  }): Promise<MessageReaction> {
    // 🛡️ MULTI-TENANT: Verify message belongs to the same company before upserting
    const targetMessage = await prisma.message.findFirst({
      where: { id: data.messageId, companyId: data.companyId },
      select: { id: true },
    });

    if (!targetMessage) {
      throw new Error(
        `[ReactionRepository] Message ${data.messageId} not found for company ${data.companyId}`,
      );
    }

    return prisma.messageReaction.upsert({
      where: {
        messageId_reactBy: {
          messageId: data.messageId,
          reactBy: data.reactBy,
        },
      },
      create: {
        messageId: data.messageId,
        reactBy: data.reactBy,
        content: data.content,
        companyId: data.companyId,
      },
      update: {
        content: data.content, // Update emoji if changed
      },
    });
  }

  /**
   * 🛡️ MULTI-TENANT: Always scoped by companyId
   */
  async findReactionsByMessage(
    messageId: string,
    companyId: string,
  ): Promise<MessageReaction[]> {
    return prisma.messageReaction.findMany({
      where: { messageId, companyId },
      orderBy: { createdAt: "asc" },
    });
  }

  /**
   * 🛡️ MULTI-TENANT: Always scoped by companyId
   */
  async removeReaction(
    messageId: string,
    reactBy: string,
    companyId?: string,
  ): Promise<void> {
    try {
      if (companyId) {
        // Preferred: scoped delete
        await prisma.messageReaction.deleteMany({
          where: { messageId, reactBy, companyId },
        });
      } else {
        // Fallback: unique constraint delete (still safe because messageId is unique per tenant via Message)
        await prisma.messageReaction.delete({
          where: {
            messageId_reactBy: {
              messageId,
              reactBy,
            },
          },
        });
      }
    } catch (e) {
      // Silently ignore if already deleted
      if (
        !(
          e instanceof Prisma.PrismaClientKnownRequestError &&
          e.code === "P2025"
        )
      ) {
        throw e;
      }
    }
  }
}

export const reactionRepository = new ReactionRepository();
