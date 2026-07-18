import { ISessionManager } from "./interfaces";
import { WhatsAppIdUtils } from "./utils/WhatsAppIdUtils";
import { Logger } from "../utils/logger";

export class OutboundJidResolver {
  constructor(private sessionManager: ISessionManager) {}

  async resolveDestinationJid(
    to: string,
    companyId: string,
    sessionId: string,
  ): Promise<string> {
    if (to.includes("@g.us")) return to;
    if (to.includes("@s.whatsapp.net")) return to;

    const cleanId = to.split("@")[0].split(":")[0];
    const isLid =
      WhatsAppIdUtils.isLid(to) ||
      (cleanId.startsWith("45") && cleanId.length === 14) ||
      (cleanId.length >= 15 && !cleanId.startsWith("120"));

    if (isLid) {
      const fullLidJid = to.includes("@lid") ? to : `${cleanId}@lid`;

      // Strategy A: Local Memory Store lookup
      const resolvedContact = this.sessionManager.findContactByLid(sessionId, fullLidJid);
      if (resolvedContact?.id && !WhatsAppIdUtils.isLid(resolvedContact.id)) {
        const realJid = WhatsAppIdUtils.getCleanJid(resolvedContact.id);
        if (realJid) {
          Logger.info(
            `[OutboundJidResolver] Resolved outbound LID ${to} via memory store -> ${realJid}`,
          );
          return realJid;
        }
      }

      // Strategy B: Active query to WhatsApp servers
      try {
        const resolvedPhone = await this.sessionManager.resolveLidToPhone(
          sessionId,
          fullLidJid,
        );
        if (resolvedPhone) {
          const phoneJid = `${resolvedPhone.replace(/\D/g, "")}@s.whatsapp.net`;
          Logger.info(
            `[OutboundJidResolver] Resolved outbound LID ${to} via active query -> ${phoneJid}`,
          );
          return phoneJid;
        }
      } catch (err) {
        Logger.warn(
          err,
          `[OutboundJidResolver] Active LID resolution failed for ${fullLidJid}:`
        );
      }

      return fullLidJid;
    }

    return WhatsAppIdUtils.getTargetJid(to);
  }
}
export default OutboundJidResolver;
