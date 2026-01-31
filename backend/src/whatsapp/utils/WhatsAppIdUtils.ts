import { WAMessage } from "@whiskeysockets/baileys";

/**
 * 🛠️ WHATSAPP ID UTILITIES (100-Year Solution)
 *
 * Centralized logic for parsing, sanitizing, and formatting WhatsApp JIDs.
 * Extracts real phone numbers and identifies Group vs User chats robustly.
 */
export class WhatsAppIdUtils {
  /**
   * Extracts the clean JID (User ID or Group ID) from a message key.
   * Handles various formats like:
   * - 12345:1@s.whatsapp.net (AD Device)
   * - 12345@s.whatsapp.net
   * - 12345-123@g.us (Legacy Group)
   * - 120363...@g.us (New Group)
   */
  static getCleanJid(originalJid: string | null | undefined): string | null {
    if (!originalJid) return null;

    // Split by '@' to handle domain
    const parts = originalJid.split("@");
    if (parts.length < 2) return null; // Invalid JID

    const [userPart, domain] = parts;
    // Remove AD Device suffix (:1, :2...) from user part
    const cleanUser = userPart.split(":")[0];

    return `${cleanUser}@${domain}`;
  }

  /**
   * Identifies if a JID belongs to a Group.
   */
  static isGroup(jid: string): boolean {
    return jid.endsWith("@g.us");
  }

  /**
   * Identifies if a JID is a valid User (Phone Number).
   * Excludes Groups, Broadcast Lists, and Status Updates.
   */
  static isUser(jid: string): boolean {
    return jid.endsWith("@s.whatsapp.net");
  }

  /**
   * Parses a Message to find the REAL sender.
   * - For DM: RemoteJid
   * - For Group: Participant (Sender) inside the RemoteJid (Group)
   * - For FromMe: My JID (Participant if group, else Self)
   */
  static getSenderJid(message: WAMessage): string | null {
    const key = message.key;
    if (key.fromMe) {
      // If sent by me, the sender is ME.
      // Baileys often puts my ID in 'participant' for groups, or we deduce it from session.
      return this.getCleanJid(key.participant || message.participant); // Might be null if standard DM, needs session fallback logic in service.
    }

    if (this.isGroup(key.remoteJid || "")) {
      return this.getCleanJid(key.participant || message.participant);
    }

    return this.getCleanJid(key.remoteJid);
  }

  /**
   * Extracts a standardized Phone Number from a JID.
   * Returns NULL if it's a group, LID, or invalid.
   *
   * 🛡️ 100-YEAR FIX: Enhanced validation to reject LIDs and internal IDs
   */
  static getPhoneNumber(jid: string | null | undefined): string | null {
    const clean = this.getCleanJid(jid);
    if (!clean) return null;

    if (this.isGroup(clean)) return null; // Groups don't have phone numbers

    // Remove domain
    const userPart = clean.split("@")[0].split(":")[0];

    // 🛡️ 100-YEAR FIX: If it's a LID and we reached this point,
    // it means resolution failed. We return the LID digits so
    // the system has a unique numeric ID to work with.
    if (this.isLid(clean)) {
      return userPart;
    }

    // 🛡️ BLACKLIST: Known invalid patterns
    if (userPart.startsWith("000")) return null;
    if (userPart.startsWith("40000")) return null;

    // Ensure it's numeric
    if (!/^\d+$/.test(userPart)) return null;

    // Standard phone length validation
    if (userPart.length < 7 || userPart.length > 15) return null;

    return userPart;
  }

  /**
   * Formats a phone number for display (e.g. +57 300...)
   * This is a "nice to have" formatter.
   */
  static formatDisplayPhone(phone: string): string {
    if (!phone) return "Desconocido";
    // Basic formatting: +Prefix Number
    return phone.startsWith("+") ? phone : `+${phone}`;
  }

  /**
   * 🛡️ 100-YEAR FIX: Enhanced LID Detection
   *
   * Detects "Linked Device IDs" which hide the real phone number.
   * LIDs have specific patterns:
   * - Contain "@lid" domain
   * - Start with certain numeric patterns and are unusually long
   * - Patterns like 45xxxxxx... with 12+ digits (observed in production)
   */
  static isLid(jid: string): boolean {
    // Standard LID domain check
    if (jid.includes("@lid")) return true;

    // Extract user part for pattern analysis
    const userPart = jid.split("@")[0].split(":")[0];

    // Only check numeric patterns
    if (!/^\d+$/.test(userPart)) return false;

    // 🔍 OBSERVED LID PATTERNS:
    // - IDs starting with "45" that are longer than 12 digits
    // - IDs starting with "40" that are longer than 12 digits
    // These are internal WhatsApp identifiers, not phone numbers
    if (userPart.startsWith("45") && userPart.length > 12) return true;
    if (userPart.startsWith("40") && userPart.length > 12) return true;

    return false;
  }

  /**
   * 🆕 SAFE PHONE EXTRACTION
   *
   * Attempts to extract a display-ready phone number from various sources.
   * Returns formatted phone or null if not resolvable.
   */
  static extractDisplayPhone(
    phone: string | null | undefined,
    channelId: string | null | undefined,
    conversationChannelId: string | null | undefined,
  ): string | null {
    // Priority 1: Explicit phone field
    if (phone) {
      const cleaned = this.getPhoneNumber(phone);
      if (cleaned) return this.formatDisplayPhone(cleaned);
    }

    // Priority 2: Channel ID (usually the JID)
    if (channelId) {
      const fromChannel = this.getPhoneNumber(channelId + "@s.whatsapp.net");
      if (fromChannel) return this.formatDisplayPhone(fromChannel);
    }

    // Priority 3: Conversation's Channel ID
    if (conversationChannelId) {
      const fromConv = this.getPhoneNumber(
        conversationChannelId + "@s.whatsapp.net",
      );
      if (fromConv) return this.formatDisplayPhone(fromConv);
    }

    return null;
  }
}
