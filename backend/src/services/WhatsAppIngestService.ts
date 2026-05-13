import { contactRepository } from "@/repositories/ContactRepository";
import { conversationRepository } from "@/repositories/ConversationRepository";
import { Logger } from "@/utils/logger";
import { parsePhoneNumber } from "libphonenumber-js";
import { Prisma } from "@prisma/client";
import { WAMessage } from "@whiskeysockets/baileys";

export class WhatsAppIngestService {
  async handleIngestion(msg: WAMessage, companyId: string) {
    // DEBUG: Verbose logging for ingestion diagnostics
    const remoteJid = msg.key?.remoteJid;
    const participant = msg.key?.participant;
    Logger.info("\n [INGEST] INCOMING MSG:");
    Logger.info(`   - Chat (RemoteJid): ${remoteJid}`);
    Logger.info(`   - Sender (Participant): ${participant || "N/A"}`);
    Logger.info(`   - PushName: ${msg.pushName}`);

    try {
      // STEP 1: Identity Extraction (Fused logic)
      const identity = await this.resolveIdentity(msg, companyId);

      if (identity.isZombie && !identity.e164Phone) {
        Logger.warn(
          `[WARNING] [INGEST] ZOMBIE REJECTED: Technical ID ${identity.originalId} unresolvable.`,
        );
        return;
      }

      const finalPhone = identity.e164Phone!;
      Logger.info(
        `[SEARCH] [INGEST] IDENTITY RESOLVED: ${finalPhone} (Source: ${identity.source})`,
      );

      // STEP 2: Mapping Persistence (Auto-Learn)
      // Save LID-to-Phone relationship for future message resolution
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

        contact = await contactRepository.update(companyId, contact.id, {
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

      Logger.info(`[OK] [INGEST] CONTACT: ${contact.name} (${contact.phone})`);

      let chat = await conversationRepository.findUnique({
        where: { id: remoteJid },
      });

      if (chat) {
        chat = await conversationRepository.update(companyId, chat.id, {
          contactId: contact.id,
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
      Logger.error(`[ERROR] [INGEST] CRITICAL ERROR: ${error}`);
    }
  }

  /**
   * "Smart Extract" logic ported from legacy systems.
   * Attempts to resolve the real phone number across multiple message properties.
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

    // STRATEGY 1: Participant (Human priority)
    if (participant && participant.includes("@s.whatsapp.net")) {
      candidate = participant;
      source = "participant";
    }
    // STRATEGY 2: RemoteJidAlt (Baileys legacy logic)
    else if (
      msg.key.remoteJidAlt &&
      msg.key.remoteJidAlt.includes("@s.whatsapp.net")
    ) {
      candidate = msg.key.remoteJidAlt;
      source = "remoteJidAlt";
    }
    // STRATEGY 3: RemoteJid (Private chat)
    else if (
      remoteJid &&
      remoteJid.includes("@s.whatsapp.net") &&
      !remoteJid.includes("@lid")
    ) {
      candidate = remoteJid;
      source = "remoteJid";
    }

    // INITIAL CLEANUP
    if (candidate) {
      candidate = candidate.split("@")[0].split(":")[0];
    }

    // STRATEGY 4: Database LID lookup (Fallback for unresolved LID)
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

    // STRATEGY 5: Message Stub Parameters (Deep legacy logic)
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

    // CANDIDATE POST-PROCESSING
    if (candidate) {
      // Colombia normalization (Legacy logic: starts with 3 and length 10 -> +57)
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
            e164Phone: parsed.number.replace("+", ""), // Save without + prefix
            isZombie: false,
            originalId: remoteJid,
            source,
          };
        }
      } catch {
        // Manual regex fallback for valid-looking candidates if parser fails
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

    // Unresolvable "Zombie" contact identity
    return {
      e164Phone: null,
      isZombie: true,
      originalId: remoteJid,
      source: "none",
    };
  }

  /**
   * Persists LID-to-Phone mapping for future identity resolution (Auto-Learn).
   */
  private async persistLidMapping(
    companyId: string,
    phone: string,
    lid: string,
  ) {
    try {
      const cleanLid = lid.replace(/@.*$/, "");
      // Prevent redundant mappings
      if (phone === cleanLid) return;

      const contact = await contactRepository.findFirst({
        where: { companyId, phone },
      });

      if (contact) {
        const currentFields =
          (contact.customFields as Record<string, unknown>) || {};
        if (currentFields.lid !== cleanLid) {
          await contactRepository.update(companyId, contact.id, {
            customFields: {
              ...currentFields,
              lid: cleanLid,
            } as unknown as Prisma.JsonValue,
          });
          Logger.info(`[SAVE] [INGEST] MAPPING SAVED: ${phone} <-> ${cleanLid}`);
        }
      }
    } catch (e) {
      Logger.warn(`[WARNING] [INGEST] Failed to save LID mapping: ${e}`);
    }
  }
}
