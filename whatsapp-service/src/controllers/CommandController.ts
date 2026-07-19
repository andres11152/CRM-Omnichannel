import { Request, Response } from "express";
import { Logger } from "../utils/logger";
import { sessionManager } from "../whatsapp";

export class CommandController {
  static async execute(req: Request, res: Response): Promise<void> {
    const { companyId, command, args } = req.body;

    if (!companyId || !command || !Array.isArray(args)) {
      res.status(400).json({ error: "Missing companyId, command, or args array" });
      return;
    }

    try {
      const activeSession = await sessionManager.findActiveSessionForCompany(companyId);
      if (!activeSession) {
        res.status(503).json({ error: `No active WhatsApp session for company: ${companyId}` });
        return;
      }

      const { sessionId, socket: sock } = activeSession;
      const { default: OutboundJidResolver } = await import("../whatsapp/OutboundJidResolver");
      const { WhatsAppIdUtils } = await import("../whatsapp/utils/WhatsAppIdUtils");
      
      const jidResolver = new OutboundJidResolver(sessionManager);
      let result: unknown = null;

      switch (command) {
        case "fetchMessageHistory": {
          // On-demand backfill: ask the linked phone for older messages before
          // `key` (fetchMessageHistory is a peer-data request to the phone, not
          // WhatsApp's servers). The resulting batch lands via the socket's own
          // messaging-history.set handler, which enqueues onto the
          // whatsapp-history-sync BullMQ queue for the backend to ingest.
          const [count, historyKey, oldestMsgTimestampMs] = args as [
            number,
            import("@whiskeysockets/baileys").WAMessageKey,
            number,
          ];
          const hasFetchHistory = typeof (sock as Record<string, unknown>).fetchMessageHistory === "function";
          if (!hasFetchHistory) {
            await sock.presenceSubscribe(historyKey.remoteJid!).catch((err: unknown) => {
              Logger.warn(`[CommandController] presenceSubscribe fallback failed: ${err instanceof Error ? err.message : String(err)}`);
            });
            result = { usedFallback: true };
            break;
          }
          const fetchFn = (sock as unknown as {
            fetchMessageHistory: (count: number, key: import("@whiskeysockets/baileys").WAMessageKey, ts: number) => Promise<void>;
          }).fetchMessageHistory;
          await fetchFn.call(sock, count, historyKey, oldestMsgTimestampMs);
          result = { usedFallback: false };
          break;
        }
        case "editOutboundMessage": {
          const [to, messageId, newContent] = args as [string, string, string];
          const jid = await jidResolver.resolveDestinationJid(to, companyId, sessionId);
          await sock.sendMessage(jid, {
            text: newContent,
            edit: { remoteJid: jid, fromMe: true, id: messageId },
          });
          break;
        }
        case "revokeOutboundMessage": {
          const [to, messageId] = args as [string, string];
          const jid = await jidResolver.resolveDestinationJid(to, companyId, sessionId);
          await sock.sendMessage(jid, {
            delete: { remoteJid: jid, fromMe: true, id: messageId },
          });
          break;
        }
        case "pinMessage": {
          const [to, messageId, fromMe, pin] = args as [string, string, boolean, boolean];
          const jid = await jidResolver.resolveDestinationJid(to, companyId, sessionId);
          await sock.sendMessage(jid, {
            pin: { remoteJid: jid, fromMe, id: messageId },
            type: pin ? 1 : 2,
            time: 604800, // 7 days
          });
          break;
        }
        case "updateBlockStatus": {
          const [to, action] = args as [string, "block" | "unblock"];
          const jid = await jidResolver.resolveDestinationJid(to, companyId, sessionId);
          await sock.updateBlockStatus(jid, action);
          break;
        }
        case "modifyChat": {
          const [to, mod] = args as [string, import("@whiskeysockets/baileys").ChatModification];
          const jid = await jidResolver.resolveDestinationJid(to, companyId, sessionId);
          
          let resolvedMod = mod;
          if ("lastMessages" in mod && Array.isArray(mod.lastMessages)) {
            resolvedMod = {
              ...mod,
              lastMessages: mod.lastMessages.map((m) => ({
                ...m,
                key: { ...m.key, remoteJid: m.key?.remoteJid || jid },
              })),
            } as import("@whiskeysockets/baileys").ChatModification;
          }
          await sock.chatModify(resolvedMod, jid);
          break;
        }
        case "updateOwnProfileName": {
          const [name] = args as [string];
          await sock.updateProfileName(name);
          break;
        }
        case "updateOwnProfilePicture": {
          const [imageUrl] = args as [string];
          const ownJid = sock.user?.id;
          if (!ownJid) {
            throw new Error(`Session ${sessionId} has no resolved own JID yet`);
          }
          await sock.updateProfilePicture(ownJid, { url: imageUrl });
          break;
        }
        case "updateGroupParticipants": {
          const [groupId, participantPhones, action] = args as [string, string[], "add" | "remove" | "promote" | "demote"];
          const jid = WhatsAppIdUtils.getTargetJid(groupId);
          const participantJids = participantPhones.map((p) => WhatsAppIdUtils.getTargetJid(p));
          result = await sock.groupParticipantsUpdate(jid, participantJids, action);
          break;
        }
        case "updateGroupSubject": {
          const [groupId, subject] = args as [string, string];
          const jid = WhatsAppIdUtils.getTargetJid(groupId);
          await sock.groupUpdateSubject(jid, subject);
          break;
        }
        case "updateGroupDescription": {
          const [groupId, description] = args as [string, string];
          const jid = WhatsAppIdUtils.getTargetJid(groupId);
          await sock.groupUpdateDescription(jid, description);
          break;
        }
        case "updateGroupSetting": {
          const [groupId, setting] = args as [string, "announcement" | "not_announcement" | "locked" | "unlocked"];
          const jid = WhatsAppIdUtils.getTargetJid(groupId);
          await sock.groupSettingUpdate(jid, setting);
          break;
        }
        case "getGroupInviteCode": {
          const [groupId] = args as [string];
          const jid = WhatsAppIdUtils.getTargetJid(groupId);
          result = await sock.groupInviteCode(jid);
          break;
        }
        case "revokeGroupInviteCode": {
          const [groupId] = args as [string];
          const jid = WhatsAppIdUtils.getTargetJid(groupId);
          result = await sock.groupRevokeInvite(jid);
          break;
        }
        case "leaveGroup": {
          const [groupId] = args as [string];
          const jid = WhatsAppIdUtils.getTargetJid(groupId);
          await sock.groupLeave(jid);
          break;
        }
        default:
          res.status(400).json({ error: `Unknown command: ${command}` });
          return;
      }

      res.json({ success: true, result });
    } catch (err: unknown) {
      Logger.error(err, `[CommandController] Failed to execute command ${command}:`);
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  }
}
