import { contactRepository } from "@/repositories/ContactRepository";
import { conversationRepository } from "@/repositories/ConversationRepository";
import { Logger } from "@/utils/logger";
import { parsePhoneNumber } from "libphonenumber-js";
import { Prisma } from "@prisma/client";
import { WAMessage } from "@whiskeysockets/baileys";

export class WhatsAppIngestService {
  async handleIngestion(msg: WAMessage, companyId: string) {
    // 🕵️ LOG VERBOSO PARA DEPURACIÓN
    const remoteJid = msg.key?.remoteJid;
    const participant = msg.key?.participant;
    Logger.info("\n📨 [INGEST] INCOMING MSG:");
    Logger.info(`   - Chat (RemoteJid): ${remoteJid}`);
    Logger.info(`   - Sender (Participant): ${participant || "N/A"}`);
    Logger.info(`   - PushName: ${msg.pushName}`);

    try {
      // 1. EXTRACCIÓN DE IDENTIDAD (Lógica Fusionada)
      const identity = await this.resolveIdentity(msg, companyId);

      if (identity.isZombie && !identity.e164Phone) {
        Logger.warn(
          `⚠️ [INGEST] ZOMBIE REJECTED: ID Técnico ${identity.originalId} sin resolución.`,
        );
        return;
      }

      const finalPhone = identity.e164Phone!;
      Logger.info(
        `🔍 [INGEST] IDENTIDAD RESUELTA: ${finalPhone} (Origen: ${identity.source})`,
      );

      // 2. PERSISTENCIA DE MAPPING (Auto-Learn Legacy)
      // Si el mensaje viene de un LID pero resolvimos el teléfono, guardamos la relación
      if (
        identity.originalId &&
        identity.originalId !== finalPhone &&
        identity.originalId.includes("@lid")
      ) {
        await this.persistLidMapping(
          companyId,
          finalPhone,
          identity.originalId,
        );
      }

      let contact = await contactRepository.findUnique({
        where: { companyId_phone: { companyId, phone: finalPhone } },
      });

      const customFieldsUpdate = identity.originalId.includes("@lid")
        ? { lid: identity.originalId }
        : {};

      if (contact) {
        // Prepare the update payload for JSONB explicitly casting lid to the generic `Record<string, unknown>` format
        const existingFields =
          (contact.customFields as Record<string, unknown>) || {};
        const combinedFields = { ...existingFields, ...customFieldsUpdate };

        contact = await contactRepository.update(contact.id, {
          name: msg.pushName || contact.name,
          customFields: combinedFields as unknown as Prisma.JsonValue,
        });
      } else {
        contact = await contactRepository.createRaw({
          data: {
            companyId,
            phone: finalPhone,
            name: msg.pushName || `~${finalPhone}`,
            customFields: customFieldsUpdate as Prisma.InputJsonObject,
          },
        });
      }

      Logger.info(`✅ [INGEST] CONTACTO: ${contact.name} (${contact.phone})`);

      let chat = await conversationRepository.findUnique({
        where: { id: remoteJid },
      });

      if (chat) {
        chat = await conversationRepository.update(chat.id, {
          contact: { connect: { id: contact.id } },
        });
      } else {
        chat = await conversationRepository.createRaw({
          data: {
            id: remoteJid,
            companyId,
            channelId: remoteJid,
            contactId: contact.id,
            subject: remoteJid,
          },
        });
      }

      return { contact, chat };
    } catch (error) {
      Logger.error(`❌ [INGEST] CRITICAL ERROR: ${error}`);
    }
  }

  /**
   * Lógica "Smart Extract" portada del código Legacy.
   * Busca el teléfono real en todas las propiedades posibles del mensaje.
   */
  private async resolveIdentity(
    msg: WAMessage & { key: { remoteJidAlt?: string } },
    companyId: string,
  ): Promise<{
    e164Phone: string | null;
    isZombie: boolean;
    originalId: string;
    source: string;
  }> {
    const remoteJid = msg.key.remoteJid;
    const participant = msg.key.participant;

    let candidate = "";
    let source = "";

    // ESTRATEGIA 1: Participant (Prioridad Humana)
    if (participant && participant.includes("@s.whatsapp.net")) {
      candidate = participant;
      source = "participant";
    }
    // ESTRATEGIA 2: RemoteJidAlt (Lógica Baileys Legacy)
    else if (
      msg.key.remoteJidAlt &&
      msg.key.remoteJidAlt.includes("@s.whatsapp.net")
    ) {
      candidate = msg.key.remoteJidAlt;
      source = "remoteJidAlt";
    }
    // ESTRATEGIA 3: RemoteJid (Si es chat privado normal)
    else if (
      remoteJid &&
      remoteJid.includes("@s.whatsapp.net") &&
      !remoteJid.includes("@lid")
    ) {
      candidate = remoteJid;
      source = "remoteJid";
    }

    // LIMPIEZA INICIAL
    if (candidate) {
      candidate = candidate.split("@")[0].split(":")[0];
    }

    // ESTRATEGIA 4: Búsqueda en DB por LID (Si todo lo anterior falló y es un LID)
    if (
      !candidate &&
      (remoteJid.includes("@lid") ||
        (participant && participant.includes("@lid")))
    ) {
      const lidToSearch = participant || remoteJid;
      const cleanLid = lidToSearch.replace(/@.*$/, "");

      const found = await contactRepository.findFirst({
        where: {
          companyId,
          OR: [
            { customFields: { path: ["lid"], equals: cleanLid } }, // PostgreSQL JSONB
            { customFields: { path: ["lid"], equals: lidToSearch } },
          ],
        },
      });

      if (found) {
        return {
          e164Phone: found.phone,
          isZombie: false,
          originalId: lidToSearch,
          source: "db_cache",
        };
      }
    }

    // ESTRATEGIA 5: Message Stub Parameters (Lógica Legacy Profunda)
    if (
      !candidate &&
      msg.messageStubParameters &&
      Array.isArray(msg.messageStubParameters)
    ) {
      for (const param of msg.messageStubParameters) {
        if (typeof param === "string" && param.includes("@s.whatsapp.net")) {
          candidate = param.split("@")[0];
          source = "stubParams";
          break;
        }
      }
    }

    // PROCESADO FINAL DEL CANDIDATO
    if (candidate) {
      // Normalización Colombia (Legacy logic: starts with 3 and length 10 -> +57)
      if (candidate.length === 10 && candidate.startsWith("3")) {
        candidate = `57${candidate}`;
      }

      try {
        // Parsing estricto con libphonenumber
        const parsed = parsePhoneNumber(
          candidate.startsWith("+") ? candidate : `+${candidate}`,
        );
        if (parsed && parsed.isValid()) {
          return {
            e164Phone: parsed.number.replace("+", ""), // Guardar sin +
            isZombie: false,
            originalId: remoteJid,
            source,
          };
        }
      } catch {
        // Si falla el parser pero parece válido (lógica legacy manual)
        if (/^\d{10,15}$/.test(candidate)) {
          return {
            e164Phone: candidate,
            isZombie: false,
            originalId: remoteJid,
            source: "regex_fallback",
          };
        }
      }
    }

    // Si llegamos aquí, es un Zombie irrecuperable
    return {
      e164Phone: null,
      isZombie: true,
      originalId: remoteJid,
      source: "none",
    };
  }

  /**
   * Guarda la relación LID <-> Teléfono para el futuro (Auto-Learn).
   */
  private async persistLidMapping(
    companyId: string,
    phone: string,
    lid: string,
  ) {
    try {
      const cleanLid = lid.replace(/@.*$/, "");
      // No guardar basura
      if (phone === cleanLid) return;

      const contact = await contactRepository.findFirst({
        where: { companyId, phone },
      });

      if (contact) {
        const currentFields =
          (contact.customFields as Record<string, unknown>) || {};
        if (currentFields.lid !== cleanLid) {
          await contactRepository.update(contact.id, {
            customFields: {
              ...currentFields,
              lid: cleanLid,
            } as unknown as Prisma.JsonValue,
          });
          Logger.info(`💾 [INGEST] MAPPING GUARDADO: ${phone} <-> ${cleanLid}`);
        }
      }
    } catch (e) {
      Logger.warn(`⚠️ [INGEST] Fallo al guardar mapping LID: ${e}`);
    }
  }
}
