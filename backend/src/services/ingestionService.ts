import { prisma } from "@/config/database";
import { AppError } from "@/utils/AppError";

export class IngestionService {
  public static async ingestMessage(
    companyId: string,
    customerEmail: string,
    customerName: string,
    channel: any,
    content: string,
    subject?: string
  ) {
    try {
      let user = await prisma.user.findUnique({
        where: { email: customerEmail },
      });

      if (!user) {
        user = await prisma.user.create({
          data: {
            email: customerEmail,
            name: customerName,
            companyId: companyId,
            role: "USER",
            password: "", // Users created this way don't need a password initially
          },
        });
      }

      let conversation = await prisma.conversation.findFirst({
        where: {
          companyId,
          participants: { some: { id: user.id } },
        },
      });

      if (!conversation) {
        conversation = await prisma.conversation.create({
          data: {
            companyId,
            subject: subject || `Conversation with ${customerName}`,
            status: "OPEN",
            participants: {
              connect: { id: user.id },
            },
          },
        });
      }

      const message = await prisma.message.create({
        data: {
          content,
          channel,
          direction: "INBOUND",
          conversationId: conversation.id,
          senderId: user.id,
        },
      });

      return { conversation, message };
    } catch (error) {
      throw new AppError("Error ingesting message", 500);
    }
  }
}
