import { ISessionManager } from "../../core/interfaces/ISessionManager";
import { GroupParticipantAction, GroupSettingValue } from "../../core/types/whatsapp.types";
import { Logger } from "@/utils/logger";
import { getEnv } from "@/config/env";
import { OutboundJidResolver } from "./OutboundJidResolver";

/**
 * [SEC] GROUP MANAGEMENT HANDLER
 *
 * All group-mutating Baileys calls (participants, subject/description,
 * settings, invite links, leave). Split out from OutboundMessageHandler per
 * the project's SRP convention (see CLAUDE.md) — this handler carries its
 * own dedicated risk gate since every method here mutates a REAL, live
 * WhatsApp group with real participants, unlike the rest of OutboundMessageHandler
 * which only affects this account's own messages/chats.
 *
 * Gated behind WA_ENABLE_GROUP_MANAGEMENT (default false) — see env.ts.
 */
export class GroupManagementHandler {
  private jidResolver: OutboundJidResolver;

  constructor(private sessionManager: ISessionManager) {
    this.jidResolver = new OutboundJidResolver(sessionManager);
  }

  private assertEnabled(): void {
    if (!getEnv().WA_ENABLE_GROUP_MANAGEMENT) {
      throw new Error(
        "Group management is disabled (WA_ENABLE_GROUP_MANAGEMENT=false). This mutates real WhatsApp groups — enable explicitly after testing against a disposable test group.",
      );
    }
  }

  private async getSocketAndJid(
    groupId: string,
    companyId: string,
  ): Promise<{ sock: import("@whiskeysockets/baileys").WASocket; jid: string; sessionId: string }> {
    const activeSession = await this.sessionManager.findActiveSessionForCompany(companyId);
    if (!activeSession) {
      throw new Error(`No active WhatsApp session for company: ${companyId}`);
    }
    const sock = activeSession.socket;
    if (!sock) {
      throw new Error(`Session ${activeSession.sessionId} has no active socket`);
    }
    const jid = groupId.endsWith("@g.us") ? groupId : `${groupId}@g.us`;
    return { sock, jid, sessionId: activeSession.sessionId };
  }

  async updateParticipants(
    companyId: string,
    groupId: string,
    participantPhones: string[],
    action: GroupParticipantAction,
  ): Promise<{ jid: string; status: string }[]> {
    this.assertEnabled();
    const { sock, jid, sessionId } = await this.getSocketAndJid(groupId, companyId);

    const participantJids = await Promise.all(
      participantPhones.map((p) => this.jidResolver.resolveDestinationJid(p, companyId, sessionId)),
    );

    try {
      const result = await sock.groupParticipantsUpdate(jid, participantJids, action);
      Logger.info(`[GroupManagement] ${action} ${participantJids.length} participant(s) in ${jid} (companyId=${companyId})`);
      return result.map((r) => ({ jid: r.jid, status: r.status || "unknown" }));
    } catch (error) {
      Logger.error(
        `[GroupManagement] Failed to ${action} participants in ${jid} (companyId=${companyId}): ${error instanceof Error ? error.message : String(error)}`,
        error,
      );
      throw error;
    }
  }

  async updateSubject(companyId: string, groupId: string, subject: string): Promise<void> {
    this.assertEnabled();
    const { sock, jid } = await this.getSocketAndJid(groupId, companyId);
    try {
      await sock.groupUpdateSubject(jid, subject);
      Logger.info(`[GroupManagement] Updated subject for ${jid} (companyId=${companyId})`);
    } catch (error) {
      Logger.error(`[GroupManagement] Failed to update subject for ${jid}: ${error instanceof Error ? error.message : String(error)}`, error);
      throw error;
    }
  }

  async updateDescription(companyId: string, groupId: string, description: string): Promise<void> {
    this.assertEnabled();
    const { sock, jid } = await this.getSocketAndJid(groupId, companyId);
    try {
      await sock.groupUpdateDescription(jid, description);
      Logger.info(`[GroupManagement] Updated description for ${jid} (companyId=${companyId})`);
    } catch (error) {
      Logger.error(`[GroupManagement] Failed to update description for ${jid}: ${error instanceof Error ? error.message : String(error)}`, error);
      throw error;
    }
  }

  async updateSetting(companyId: string, groupId: string, setting: GroupSettingValue): Promise<void> {
    this.assertEnabled();
    const { sock, jid } = await this.getSocketAndJid(groupId, companyId);
    try {
      await sock.groupSettingUpdate(jid, setting);
      Logger.info(`[GroupManagement] Updated setting "${setting}" for ${jid} (companyId=${companyId})`);
    } catch (error) {
      Logger.error(`[GroupManagement] Failed to update setting for ${jid}: ${error instanceof Error ? error.message : String(error)}`, error);
      throw error;
    }
  }

  async getInviteCode(companyId: string, groupId: string): Promise<string> {
    this.assertEnabled();
    const { sock, jid } = await this.getSocketAndJid(groupId, companyId);
    try {
      const code = await sock.groupInviteCode(jid);
      if (!code) throw new Error("Baileys returned no invite code");
      return `https://chat.whatsapp.com/${code}`;
    } catch (error) {
      Logger.error(`[GroupManagement] Failed to get invite code for ${jid}: ${error instanceof Error ? error.message : String(error)}`, error);
      throw error;
    }
  }

  async revokeInviteCode(companyId: string, groupId: string): Promise<string> {
    this.assertEnabled();
    const { sock, jid } = await this.getSocketAndJid(groupId, companyId);
    try {
      const code = await sock.groupRevokeInvite(jid);
      if (!code) throw new Error("Baileys returned no invite code after revoke");
      Logger.info(`[GroupManagement] Revoked invite link for ${jid} (companyId=${companyId})`);
      return `https://chat.whatsapp.com/${code}`;
    } catch (error) {
      Logger.error(`[GroupManagement] Failed to revoke invite code for ${jid}: ${error instanceof Error ? error.message : String(error)}`, error);
      throw error;
    }
  }

  async leaveGroup(companyId: string, groupId: string): Promise<void> {
    this.assertEnabled();
    const { sock, jid } = await this.getSocketAndJid(groupId, companyId);
    try {
      await sock.groupLeave(jid);
      Logger.info(`[GroupManagement] Left group ${jid} (companyId=${companyId})`);
    } catch (error) {
      Logger.error(`[GroupManagement] Failed to leave group ${jid}: ${error instanceof Error ? error.message : String(error)}`, error);
      throw error;
    }
  }
}
