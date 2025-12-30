import { prisma } from "@/config/prisma";
import { whatsappService } from "@/services/whatsapp.service";
import { Logger } from "@/utils/logger";

export const initScheduler = () => {
  Logger.info("⏰ Scheduler Service Initialized");

  // Running every 30 seconds
  setInterval(async () => {
    try {
      const now = new Date();

      // 1. Fetch pending scheduled messages
      const pendingMessages = await prisma.message.findMany({
        where: {
          status: "SCHEDULED",
        },
        include: { conversation: true },
      });

      for (const msg of pendingMessages) {
        const meta = msg.metadata as any;
        if (!meta || !meta.scheduledAt) continue;

        const scheduledTime = new Date(meta.scheduledAt);

        if (scheduledTime <= now) {
          Logger.info(
            `⏰ Executing Scheduled Message ${msg.id} for Conv ${msg.conversationId}`
          );

          let targetPhone = msg.conversation.channelId;
          // Fallback for missing channelId (common in imported chats)
          if (!targetPhone) {
            const users = await prisma.user.findMany({
              where: {
                conversations: { some: { id: msg.conversationId } },
                role: "USER",
              },
              take: 1,
            });
            if (users[0]?.phone) targetPhone = users[0].phone;
          }

          if (!targetPhone) {
            Logger.warn(
              `Skipping scheduled msg ${msg.id}: No channelId/Phone found`
            );
            continue;
          }

          try {
            // 2. Send via WhatsApp Service (Creates NEW Sent Message)
            await whatsappService.sendMessage(targetPhone, msg.content, {
              companyId: msg.conversation.companyId,
              conversationId: msg.conversation.id,
              senderId: msg.senderId,
              media: meta.attachment, // Pass attachment if exists
              metadata: { wasScheduled: true },
            });

            // 3. Delete the "Pending" placeholder so user sees the real SENT message
            await prisma.message.delete({
              where: { id: msg.id },
            });

            Logger.info(`✅ Scheduled Msg Executed & Placeholder Deleted`);
          } catch (sendError) {
            Logger.error(
              `Failed to execute scheduled msg ${msg.id}`,
              sendError
            );
          }
        }
      }
    } catch (e) {
      Logger.error("Scheduler Cycle Error", e);
    }
  }, 30000);
};
