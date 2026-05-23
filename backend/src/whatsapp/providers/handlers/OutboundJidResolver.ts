import { ISessionManager } from "../../core/interfaces/ISessionManager";
import { WhatsAppIdUtils } from "../../utils/WhatsAppIdUtils";
import { Logger } from "@/utils/logger";
import { chatService } from "@/services/ChatService";

/**
 * [BUILD] OUTBOUND JID RESOLVER (SRP Refactored)
 *
 * Responsabilidad Única: Resolver el identificador de destino final (JID) de WhatsApp,
 * manejando de forma transparente la traducción de números LID a JID estándar de teléfono
 * utilizando tres estrategias de resolución ordenada (Memoria, Base de Datos, API Activa).
 */
export class OutboundJidResolver {
  constructor(private sessionManager: ISessionManager) {}

  /**
   * Resuelve el JID de destino para envío de mensajes de WhatsApp.
   * Maneja grupos, JIDs de teléfono directos y traduce LIDs utilizando
   * estrategias en cascada para evitar la interrupción de la mensajería.
   */
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

      // Estrategia A: Búsqueda en el Memory Store local de Baileys
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

      // Estrategia B: Búsqueda en la tabla de mapeo de contactos en Base de Datos
      try {
        const contact = await chatService.findContactByLid(companyId, cleanId);
        if (contact && contact.phone) {
          const phoneJid = `${contact.phone.replace(/\D/g, "")}@s.whatsapp.net`;
          Logger.info(
            `[OutboundJidResolver] Resolved outbound LID ${to} via DB mapping -> ${phoneJid}`,
          );
          return phoneJid;
        }
      } catch (err) {
        Logger.warn(
          `[OutboundJidResolver] Failed to query contact by LID for ${cleanId}`,
          err,
        );
      }

      // Estrategia C: Resolución activa a través de consulta socket en vivo a la API de WhatsApp
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

          const cleanPhone = WhatsAppIdUtils.getPhoneNumber(resolvedPhone);
          if (cleanPhone) {
            await chatService.saveLidPhoneMapping(companyId, cleanId, cleanPhone);
          }
          return phoneJid;
        }
      } catch (err) {
        Logger.warn(
          `[OutboundJidResolver] Active LID resolution failed for ${fullLidJid}`,
          err,
        );
      }

      return fullLidJid;
    }

    return WhatsAppIdUtils.getTargetJid(to);
  }
}
