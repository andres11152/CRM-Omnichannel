import { PrismaClient } from "@prisma/client";
import { parsePhoneNumber } from "libphonenumber-js";

const prisma = new PrismaClient();

export class WhatsAppIngestService {
  /**
   * Procesa el mensaje entrante.
   * Fusión de lógica V2 (Arquitectura) + Lógica Legacy (Smart Extraction).
   */
  async handleIngestion(msg: any, companyId: string) {
    // 🕵️ LOG VERBOSO PARA DEPURACIÓN
    const remoteJid = msg.key.remoteJid;
    const participant = msg.key.participant;
    console.log("\n📨 [INGEST] INCOMING MSG:");
    console.log(`   - Chat (RemoteJid): ${remoteJid}`);
    console.log(`   - Sender (Participant): ${participant || "N/A"}`);
    console.log(`   - PushName: ${msg.pushName}`);

    try {
      // 1. EXTRACCIÓN DE IDENTIDAD (Lógica Fusionada)
      const identity = await this.resolveIdentity(msg, companyId);

      if (identity.isZombie && !identity.e164Phone) {
        console.warn(
          `⚠️ [INGEST] ZOMBIE REJECTED: ID Técnico ${identity.originalId} sin resolución.`
        );
        return;
      }

      const finalPhone = identity.e164Phone!;
      console.log(
        `🔍 [INGEST] IDENTIDAD RESUELTA: ${finalPhone} (Origen: ${identity.source})`
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
          identity.originalId
        );
      }

      // 3. UPSERT CONTACTO
      const contact = await prisma.contact.upsert({
        where: {
          companyId_phone: { companyId, phone: finalPhone },
        },
        update: {
          name: msg.pushName || undefined,
          // lastActive removed (not in schema)
          // Si descubrimos un LID nuevo, actualizamos customFields sin borrar los existentes
          ...(identity.originalId.includes("@lid")
            ? {
                customFields: {
                  upsert: {
                    update: { lid: identity.originalId },
                    set: { lid: identity.originalId }, // Para JSONB simple
                  },
                },
              }
            : {}),
        },
        create: {
          companyId,
          phone: finalPhone,
          name: msg.pushName || `~${finalPhone}`,
          // channel removed (not in schema)
          customFields: identity.originalId.includes("@lid")
            ? { lid: identity.originalId }
            : {},
        },
      });

      console.log(`✅ [INGEST] CONTACTO: ${contact.name} (${contact.phone})`);

      // 4. VINCULAR CHAT (Siempre usamos el remoteJid técnico para el ID del chat)
      const chat = await prisma.conversation.upsert({
        where: { id: remoteJid },
        update: {
          contactId: contact.id,
          // lastMessageAt/unreadCount removed
        },
        create: {
          id: remoteJid,
          companyId,
          contactId: contact.id,
          // channel removed (not in schema)
          // lastMessageAt/unreadCount removed
        },
      });

      return { contact, chat };
    } catch (error) {
      console.error("❌ [INGEST] CRITICAL ERROR:", error);
    }
  }

  /**
   * Lógica "Smart Extract" portada del código Legacy.
   * Busca el teléfono real en todas las propiedades posibles del mensaje.
   */
  private async resolveIdentity(
    msg: any,
    companyId: string
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

      // Buscar en Contactos existentes
      const found = await prisma.contact.findFirst({
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
          candidate.startsWith("+") ? candidate : `+${candidate}`
        );
        if (parsed && parsed.isValid()) {
          return {
            e164Phone: parsed.number.replace("+", ""), // Guardar sin +
            isZombie: false,
            originalId: remoteJid,
            source,
          };
        }
      } catch (e) {
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
    lid: string
  ) {
    try {
      const cleanLid = lid.replace(/@.*$/, "");
      // No guardar basura
      if (phone === cleanLid) return;

      const contact = await prisma.contact.findFirst({
        where: { companyId, phone },
      });

      if (contact) {
        const currentFields = (contact.customFields as any) || {};
        if (currentFields.lid !== cleanLid) {
          await prisma.contact.update({
            where: { id: contact.id },
            data: {
              customFields: { ...currentFields, lid: cleanLid },
            },
          });
          console.log(`💾 [INGEST] MAPPING GUARDADO: ${phone} <-> ${cleanLid}`);
        }
      }
    } catch (e) {
      console.warn("⚠️ [INGEST] Fallo al guardar mapping LID:", e);
    }
  }
}
