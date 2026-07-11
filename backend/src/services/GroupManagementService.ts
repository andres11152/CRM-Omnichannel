import { conversationRepository } from "@/repositories/ConversationRepository";
import { AppError } from "@/utils/AppError";
import { HTTP_STATUS } from "@/constants/httpStatus";
import { whatsappMessagingService } from "@/whatsapp";

/**
 * [SEC] GROUP MANAGEMENT SERVICE
 *
 * Resolves a conversationId (or ticketId, same fallback used across this
 * codebase) to a group JID, then delegates the actual Baileys mutation to
 * whatsappMessagingService. All mutations are gated server-side by
 * WA_ENABLE_GROUP_MANAGEMENT (see GroupManagementHandler.ts) — this service
 * doesn't duplicate that check, it just surfaces whatever error the handler
 * throws when the flag is off.
 */
class GroupManagementService {
  private async resolveGroupJid(companyId: string, conversationId: string): Promise<string> {
    let conversation = await conversationRepository.findFirst({
      where: { id: conversationId, companyId },
    });

    if (!conversation) {
      const { ticketSyncService } = await import("./TicketSyncService");
      const ticket = await ticketSyncService.findByIdWithCreator(conversationId, companyId);
      if (ticket && ticket.companyId === companyId && ticket.conversationId) {
        conversation = await conversationRepository.findFirst({
          where: { id: ticket.conversationId, companyId },
        });
      }
    }

    if (!conversation) {
      throw new AppError("Conversation not found", HTTP_STATUS.NOT_FOUND);
    }
    if (!conversation.isGroup) {
      throw new AppError("This conversation is not a group", HTTP_STATUS.BAD_REQUEST);
    }

    return conversation.channelId.includes("@") ? conversation.channelId : `${conversation.channelId}@g.us`;
  }

  async updateParticipants(
    companyId: string,
    conversationId: string,
    participantPhones: string[],
    action: "add" | "remove" | "promote" | "demote",
  ) {
    const groupJid = await this.resolveGroupJid(companyId, conversationId);
    return whatsappMessagingService.updateGroupParticipants(companyId, groupJid, participantPhones, action);
  }

  async updateSubject(companyId: string, conversationId: string, subject: string) {
    const groupJid = await this.resolveGroupJid(companyId, conversationId);
    return whatsappMessagingService.updateGroupSubject(companyId, groupJid, subject);
  }

  async updateDescription(companyId: string, conversationId: string, description: string) {
    const groupJid = await this.resolveGroupJid(companyId, conversationId);
    return whatsappMessagingService.updateGroupDescription(companyId, groupJid, description);
  }

  async updateSetting(
    companyId: string,
    conversationId: string,
    setting: "announcement" | "not_announcement" | "locked" | "unlocked",
  ) {
    const groupJid = await this.resolveGroupJid(companyId, conversationId);
    return whatsappMessagingService.updateGroupSetting(companyId, groupJid, setting);
  }

  async getInviteCode(companyId: string, conversationId: string) {
    const groupJid = await this.resolveGroupJid(companyId, conversationId);
    return whatsappMessagingService.getGroupInviteCode(companyId, groupJid);
  }

  async revokeInviteCode(companyId: string, conversationId: string) {
    const groupJid = await this.resolveGroupJid(companyId, conversationId);
    return whatsappMessagingService.revokeGroupInviteCode(companyId, groupJid);
  }

  async leaveGroup(companyId: string, conversationId: string) {
    const groupJid = await this.resolveGroupJid(companyId, conversationId);
    return whatsappMessagingService.leaveGroup(companyId, groupJid);
  }
}

export const groupManagementService = new GroupManagementService();
