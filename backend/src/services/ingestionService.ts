import { Logger } from "@/utils/logger";
import { AppError } from "@/utils/AppError";
import { Channel } from "@prisma/client";
import { userRepository } from "@/repositories/UserRepository";
import { conversationRepository } from "@/repositories/ConversationRepository";
import { messageRepository } from "@/repositories/MessageRepository";

export class IngestionService {
  public static async ingestMessage(
    companyId: string,
    customerEmail: string,
    customerName: string,
    channel: Channel,
    content: string,
    subject?: string,
  ) {
    try {
      let user = await userRepository.findFirst({
        where: { email: customerEmail },
      });

      if (user && user.companyId !== companyId) {
        // 🚨 ARCHITECTURAL LIMITATION: User.email is globally unique @unique.
        // If a "contact" uses the same email across two companies that use our CRM,
        // the DB schema links them to the First Company's User record.
        // For now, we block cross-tenant ingestion to prevent data crossover.
        // FUTURE FIX: Migrate senderId in Message to use Contact instead of User for external ends.
        Logger.error(
          `[Ingestion] Cross-tenant leakage blocked: User ${customerEmail} belongs to company ${user.companyId}, but tried to ingest into ${companyId}`,
        );
        throw new AppError(
          "El usuario ya está registrado en otra instancia de la plataforma.",
          403,
        );
      }

      if (!user) {
        user = await userRepository.create({
          data: {
            email: customerEmail,
            name: customerName,
            companyId: companyId,
            role: "USER",
            password: "", // Users created this way don't need a password initially
          },
        });
      }

      let conversation = await conversationRepository.findFirst({
        where: {
          companyId,
          participants: { some: { id: user.id } },
        },
      });

      if (!conversation) {
        conversation = await conversationRepository.create({
          companyId,
          subject: subject || `Conversation with ${customerName}`,
          status: "OPEN",
          channelId: `email_${user.id}`,
          userId: user.id,
        });
      }

      const message = await messageRepository.create({
        data: {
          content,
          channel,
          direction: "INBOUND",
          conversationId: conversation.id,
          senderId: user.id,
        },
      });

      return { conversation, message };
    } catch {
      throw new AppError("Error ingesting message", 500);
    }
  }
}
