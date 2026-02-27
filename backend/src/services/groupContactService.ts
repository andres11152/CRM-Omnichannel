import { conversationRepository } from "@/repositories/ConversationRepository";
import { whatsappSessionRepository } from "@/repositories/WhatsAppSessionRepository";
import { contactRepository } from "@/repositories/ContactRepository";
import { contactService } from "@/services/contactService";
import { whatsappService } from "@/whatsapp";
import { WhatsAppIdUtils } from "@/whatsapp/utils/WhatsAppIdUtils";
import { AppError } from "@/utils/AppError";
import { HTTP_STATUS } from "@/constants/httpStatus";
import { Logger } from "@/utils/logger";

/**
 * 🔐 GROUP PARTICIPANT TYPES
 * Strict TypeScript - No ANY
 */

/** Raw participant from WhatsApp API */
interface WhatsAppParticipant {
  id: string;
  admin?: "admin" | "superadmin" | null;
}

/** Validated participant ready for CRM */
export interface GroupParticipantDTO {
  /** Raw WhatsApp JID */
  jid: string;
  /** Extracted phone number (null if LID/invalid) */
  phone: string | null;
  /** Display name (pushName or formatted phone) */
  displayName: string;
  /** Is group admin */
  isAdmin: boolean;
  /** Is super admin (group creator) */
  isSuperAdmin: boolean;
  /** Can be added to CRM (has real phone) */
  canAddToCRM: boolean;
  /** Already exists in CRM */
  existsInCRM: boolean;
  /** Contact ID if exists */
  contactId: string | null;
}

/** Response for group participants list */
export interface GroupParticipantsResponse {
  groupId: string;
  groupName: string;
  participantCount: number;
  participants: GroupParticipantDTO[];
  /** How many can be added to CRM */
  addableCount: number;
  /** How many already exist in CRM */
  existingCount: number;
}

/** Params for adding participant to CRM */
export interface AddParticipantParams {
  jid: string;
  customName?: string;
  tags?: string[];
}

/** Result of adding participant */
export interface AddParticipantResult {
  success: boolean;
  contactId?: string;
  phone?: string;
  error?: string;
}

/**
 * 🛡️ 100-YEAR ENTERPRISE SERVICE
 * Handles extraction and CRM integration of group participants
 */
export const groupContactService = {
  /**
   * Get all participants from a WhatsApp group with CRM status
   */
  async getGroupParticipants(
    companyId: string,
    conversationId: string,
  ): Promise<GroupParticipantsResponse> {
    // 1. Get conversation to validate it's a group
    const conversation = await conversationRepository.findFirst({
      where: { id: conversationId, companyId },
    });

    if (!conversation) {
      throw new AppError("Conversation not found", HTTP_STATUS.NOT_FOUND);
    }

    if (!conversation.isGroup) {
      throw new AppError(
        "This conversation is not a group",
        HTTP_STATUS.BAD_REQUEST,
      );
    }

    // 2. 🛡️ 100-YEAR FIX: Multi-Session Resilience
    // Fetch ALL connected sessions. If one fails (e.g. not in group), try others.
    const sessions = await whatsappSessionRepository.findMany({
      where: { companyId, status: "CONNECTED" },
    });

    if (sessions.length === 0) {
      throw new AppError(
        "No active WhatsApp session found",
        HTTP_STATUS.SERVICE_UNAVAILABLE,
      );
    }

    // 🛡️ Robust JID formatting
    const groupJid = conversation.channelId.includes("@")
      ? conversation.channelId
      : `${conversation.channelId}@g.us`;

    Logger.info(
      `[GroupContactService] Resolving participants for Group JID: ${groupJid} (DB ChannelID: ${conversation.channelId})`,
    );

    let groupMetadata: {
      id: string;
      subject: string;
      participants: WhatsAppParticipant[];
    } | null = null;

    let lastError: unknown | null = null;
    let attemptedSessions = 0;

    // 3. Try sequentially until one works
    let workingSession: (typeof sessions)[0] | null = null;

    for (const session of sessions) {
      // 🛡️ FIX: Use getSocket() to get the actual WASocket object, not the status DTO
      const sock = whatsappService.getSocket(session.sessionId);
      if (!sock) {
        Logger.warn(
          `[GroupContactService] Session ${session.sessionId} found in DB as CONNECTED but no active socket in memory.`,
        );
        continue;
      }

      attemptedSessions++;
      try {
        Logger.debug(
          `[GroupContactService] Attempting fetch with session ${session.sessionId} (${session.phone})`,
        );
        groupMetadata = await sock.groupMetadata(groupJid);
        // If successful, stop trying
        if (groupMetadata) {
          Logger.info(
            `[GroupContactService] ✅ Fetched group metadata via session ${session.sessionId}`,
          );
          workingSession = session;
          break;
        }
      } catch (error: unknown) {
        const errorMsg = error instanceof Error ? error.message : String(error);

        Logger.warn(
          `[GroupContactService] Session ${session.sessionId} failed to fetch group: ${errorMsg}`,
        );

        // Analyze specific Baileys errors
        if (
          errorMsg.includes("401") ||
          errorMsg.includes("403") ||
          errorMsg.includes("not-authorized")
        ) {
          Logger.warn(
            `[GroupContactService] Session ${session.sessionId} is likely NOT a participant of this group.`,
          );
        }
        if (errorMsg.includes("404") || errorMsg.includes("not-found")) {
          Logger.error(
            `[GroupContactService] Group JID ${groupJid} does NOT exist on WhatsApp servers.`,
          );
        }

        lastError = error;
        // Continue to next session
      }
    }

    if (!groupMetadata || !workingSession) {
      const lastErrorMsg =
        lastError instanceof Error
          ? lastError.message
          : String(lastError || "Unknown error");

      Logger.error(
        `[GroupContactService] Failed to fetch group metadata. DB Sessions: ${sessions.length}. Attempted Sockets: ${attemptedSessions}.`,
        {
          groupJid,
          lastError: lastErrorMsg,
        },
      );
      throw new AppError(
        `Failed to fetch group participants. Tried ${attemptedSessions}/${sessions.length} active sessions. Last Error: ${lastErrorMsg}`,
        HTTP_STATUS.SERVICE_UNAVAILABLE,
      );
    }

    // 4. Process participants
    const participants: GroupParticipantDTO[] = [];
    let addableCount = 0;
    let existingCount = 0;

    // Get all existing contacts for this company (for fast lookup)
    const existingContacts = await contactRepository.findMany({
      where: { companyId, deletedAt: null },
      select: { id: true, phone: true },
    });

    const phoneToContactId = new Map<string, string>();
    for (const contact of existingContacts) {
      if (contact.phone) {
        // Normalize for comparison
        const normalized = contact.phone.replace(/\D/g, "");
        phoneToContactId.set(normalized, contact.id);
      }
    }

    for (const participant of groupMetadata.participants) {
      const cleanJid = WhatsAppIdUtils.getCleanJid(participant.id);
      if (!cleanJid) continue;

      // Skip our own number (the business number)
      // 🛡️ 100-YEAR FIX: Use captured workingSession
      if (workingSession.phone && cleanJid.includes(workingSession.phone)) {
        continue;
      }

      const phone = WhatsAppIdUtils.getPhoneNumber(cleanJid);
      const canAddToCRM = phone !== null;
      const existingContactId = phone ? phoneToContactId.get(phone) : null;
      const existsInCRM = existingContactId !== null;

      if (canAddToCRM) addableCount++;
      if (existsInCRM) existingCount++;

      participants.push({
        jid: cleanJid,
        phone,
        displayName: phone
          ? WhatsAppIdUtils.formatDisplayPhone(phone)
          : "Usuario sin número",
        isAdmin: participant.admin === "admin",
        isSuperAdmin: participant.admin === "superadmin",
        canAddToCRM,
        existsInCRM,
        contactId: existingContactId ?? null,
      });
    }

    // Sort: Admins first, then by phone availability, then alphabetically
    participants.sort((a, b) => {
      if (a.isSuperAdmin !== b.isSuperAdmin) return a.isSuperAdmin ? -1 : 1;
      if (a.isAdmin !== b.isAdmin) return a.isAdmin ? -1 : 1;
      if (a.canAddToCRM !== b.canAddToCRM) return a.canAddToCRM ? -1 : 1;
      return a.displayName.localeCompare(b.displayName);
    });

    return {
      groupId: conversation.id,
      groupName: groupMetadata.subject || "Grupo",
      participantCount: participants.length,
      participants,
      addableCount,
      existingCount,
    };
  },

  /**
   * Add a single participant to CRM
   */
  async addParticipantToCRM(
    companyId: string,
    conversationId: string,
    params: AddParticipantParams,
  ): Promise<AddParticipantResult> {
    // Validate conversation belongs to company
    const conversation = await conversationRepository.findFirst({
      where: { id: conversationId, companyId },
    });

    if (!conversation) {
      return { success: false, error: "Conversation not found" };
    }

    // Extract and validate phone
    const phone = WhatsAppIdUtils.getPhoneNumber(params.jid);

    if (!phone) {
      return {
        success: false,
        error: "Cannot add to CRM: No valid phone number (LID detected)",
      };
    }

    // Check if already exists
    const existing = await contactRepository.findFirst({
      where: { companyId, phone, deletedAt: null },
    });

    if (existing) {
      return {
        success: true,
        contactId: existing.id,
        phone,
        error: "Contact already exists in CRM",
      };
    }

    // Create contact
    try {
      const contact = await contactService.upsert(companyId, {
        phone,
        name: params.customName || WhatsAppIdUtils.formatDisplayPhone(phone),
        tags: params.tags || ["Importado de Grupo"],
        customFields: {
          source: "whatsapp_group",
          groupId: conversationId,
          whatsappJid: params.jid,
        },
      });

      Logger.info(
        `[GroupContactService] ✅ Added group participant to CRM: ${phone}`,
      );

      return {
        success: true,
        contactId: contact.id,
        phone,
      };
    } catch (error) {
      Logger.error(`[GroupContactService] Failed to add participant`, {
        phone,
        error,
      });
      return {
        success: false,
        error: "Failed to create contact",
      };
    }
  },

  /**
   * Add multiple participants to CRM (bulk operation)
   */
  async addMultipleParticipantsToCRM(
    companyId: string,
    conversationId: string,
    participants: AddParticipantParams[],
  ): Promise<{
    total: number;
    successful: number;
    failed: number;
    results: AddParticipantResult[];
  }> {
    const results: AddParticipantResult[] = [];
    let successful = 0;
    let failed = 0;

    for (const participant of participants) {
      const result = await this.addParticipantToCRM(
        companyId,
        conversationId,
        participant,
      );
      results.push(result);
      if (result.success && !result.error?.includes("already exists")) {
        successful++;
      } else if (!result.success) {
        failed++;
      }
    }

    return {
      total: participants.length,
      successful,
      failed,
      results,
    };
  },
};
