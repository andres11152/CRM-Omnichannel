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
          // [SEC] ENTERPRISE GUARD: Validate phone/LID before creating contacts
          // Allow valid phone numbers or LIDs
          if (!WhatsAppIdUtils.isRealPhoneNumber(phone.replace(/\D/g, "")) && !WhatsAppIdUtils.isLid(phone)) {
            Logger.warn(`[SyncRepo] [BLOCKED] Skipping invalid phone / LID: ${phone}`);
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
      
      // [SEC] ENTERPRISE FIX: Heal corrupted contact names during sync
      // If a valid name (not a phone number) is provided and it differs from the current name, update it.
      // This fixes the bug where contacts were stuck with the bot's pushName.
      if (name && customerUserId && !isGroup) {
        const currentName = conversation.participants[0]?.name;
        const isNewNamePhone = /^\+?\d[\d\s-]*$/.test(name);
        if (!isNewNamePhone && name !== currentName) {
          Logger.info(`[SyncRepo] Healing corrupted contact name for ${phone}: ${currentName} -> ${name}`);
          try {
            await chatService.upsertWhatsAppUser({
              email: `${phone}@whatsapp.user`,
              name: name,
              companyId,
              phone: phone,
              role: "USER",
            });
            // Update local memory so we don't spam the DB in the same loop
            conversation.participants[0].name = name;
          } catch (err) {
            Logger.warn(`[SyncRepo] Failed to heal contact name for ${phone}`, err);
          }
        }
      }
    }

    return { conversation: conversation!, customerUserId };
  }
}

export const syncRepositoryHelper = new SyncRepositoryHelper();
