import { userRepository } from "@/repositories/UserRepository";
import { conversationRepository } from "@/repositories/ConversationRepository";
import { chatService } from "@/services/ChatService";
import { Logger } from "@/utils/logger";
import { User, Conversation } from "@prisma/client";
import { WhatsAppIdUtils } from "@/whatsapp/utils/WhatsAppIdUtils";

export class SyncRepositoryHelper {
  async getAdminUser(companyId: string) {
    return userRepository.findFirst({
      where: { companyId, role: { in: ["ADMIN", "MASTER"] } },
      select: { id: true },
    });
  }

  async findConversation(companyId: string, channelId: string) {
    return conversationRepository.findFirst({
      where: { companyId, channelId },
      include: { participants: { select: { id: true } } },
    });
  }

  async ensureConversation(params: {
    companyId: string,
    phone: string,
    name?: string,
    isGroup: boolean
  }) {
    const { companyId, phone, name, isGroup } = params;
    
    let conversation = await this.findConversation(companyId, phone) as (Conversation & { participants: User[] }) | null;
    let customerUserId: string | undefined;

    if (!conversation) {
      Logger.debug(`[SyncRepo] Auto-creating conversation: ${phone}`);
      try {
        let createdUserId: string | undefined;
        let subject = name || phone;

        if (!isGroup) {
          // [SEC] ENTERPRISE GUARD: Validate phone before creating contacts
          // Blocks LID bases that somehow leaked through resolveJid
          if (!WhatsAppIdUtils.isRealPhoneNumber(phone.replace(/\D/g, ""))) {
            Logger.warn(`[SyncRepo] [BLOCKED] Skipping invalid phone (likely LID): ${phone}`);
            return { conversation: null as unknown as Conversation & { participants: User[] }, customerUserId: undefined };
          }
          const newUser = await chatService.upsertWhatsAppUser({
            email: `${phone}@whatsapp.user`,
            name: name || `+${phone}`,
            companyId,
            phone: phone,
            role: "USER",
          });
          createdUserId = newUser.id;
          customerUserId = createdUserId;
          subject = newUser.name || phone;
        } else {
          subject = name ? `[GROUP] ${name}` : `[GROUP] Grupo Histórico`;
        }

        await chatService.createConversation({
          companyId,
          channelId: phone,
          subject,
          userId: createdUserId,
          isGroup,
          groupMetadata: isGroup && name ? { groupName: name } : undefined,
        });

        conversation = (await this.findConversation(companyId, phone)) as (Conversation & { participants: User[] });
      } catch (err: unknown) {
        if (err instanceof Error && err.message?.includes("Unique constraint failed")) {
          conversation = (await this.findConversation(companyId, phone)) as (Conversation & { participants: User[] });
        } else {
          throw err;
        }
      }
    } else {
      customerUserId = conversation.participants[0]?.id;
    }

    return { conversation: conversation!, customerUserId };
  }
}

export const syncRepositoryHelper = new SyncRepositoryHelper();
