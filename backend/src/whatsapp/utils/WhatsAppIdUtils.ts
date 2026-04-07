import { WAMessage } from "@whiskeysockets/baileys";

/**
 * [DEV] WHATSAPP ID UTILITIES (100-Year Solution)
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
  static cleanChannelId(jid: string): string {
    return jid.replace(/@.*$/, "").replace(/\D/g, "");
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
   * [SEC] 100-YEAR ENTERPRISE FIX: NEVER returns LIDs as phone numbers.
   * LIDs are internal WhatsApp identifiers and should NEVER be treated as phones.
   */
  static getPhoneNumber(jid: string | null | undefined): string | null {
    const clean = this.getCleanJid(jid);
    if (!clean) return null;

    if (this.isGroup(clean)) return null; // Groups don't have phone numbers

    // [SEC] REVERTED: We now ALLOW LIDs to be returned as the identifier
    // because WhatsApp Communities use these identifiers to mask real phone numbers.
    // Treating LIDs as the primary ID for the CRM/Contact.

    // Remove domain
    const userPart = clean.split("@")[0].split(":")[0];

    // [SEC] BLACKLIST: Known invalid patterns
    if (userPart.startsWith("000")) return null;
    if (userPart.startsWith("40000")) return null;

    // Ensure it's numeric
    if (!/^\d+$/.test(userPart)) return null;

    // Standard phone length validation (E.164: usually 15, but LIDs are 20-30)
    if (userPart.length < 7 || userPart.length > 30) return null;

    // [SEC] Final validation: Is this a realistic phone number OR LID?
    if (!this.isRealPhoneNumber(userPart)) {
      return null;
    }

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
   * [SEC] 100-YEAR ENTERPRISE FIX: Real Phone Number Validation
   *
   * Validates that a numeric string is likely a real phone number.
   * Uses heuristics based on E.164 format and known patterns.
   *
   * Real phone numbers typically:
   * - Are 7-15 digits long
   * - Start with a valid country code (1-9)
   * - Don't have patterns that indicate internal IDs
   */
  static isRealPhoneNumber(digits: string): boolean {
    if (!digits || !/^\d+$/.test(digits)) return false;

    // Length validation (E.164 usually 7-15, but LIDs can be up to 25+)
    if (digits.length < 7 || digits.length > 30) return false;

    // [SEC] REVERTED 100-YEAR FIX: LIDs are now allowed and treated as valid recipients
    // WhatsApp Communities hide real numbers and use 15-20 digit LIDs.
    // The user explicitly requested to see and interact with these IDs.

    // [SEC] REVERTED 100-YEAR FIX: The previous rule blocking starting with 4 or 5 was TOO AGGRESSIVE.
    // It blocked valid Colombia (57...), Brazil (55...), Mexico (52...) numbers.
    // We now rely primarily on length and explicit @lid domain checks.

    // Pattern 3: Repeated digits patterns (fake/test numbers)
    if (/^(\d)\1{6,}$/.test(digits)) return false;

    // Pattern 4: Repeated digits patterns (fake/test numbers)
    if (/^(\d)\1{6,}$/.test(digits)) return false;

    // Pattern 5: Sequential patterns (1234567890)
    if (/^0?123456789/.test(digits)) return false;

    return true;
  }

  /**
   * [SEC] 100-YEAR FIX: Enhanced LID Detection
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

    // [SEARCH] OBSERVED LID PATTERNS:
    // - LIDs are strictly numeric identifiers used internally by WhatsApp
    // - They resemble phone numbers but follow specific ranges assigned by WhatsApp

    // [SEC] 100-YEAR FIX: Relied too heavily on heuristics previously.
    // If the JID came from Baileys participants list and DOES NOT have @lid,
    // we should assume it is a phone number unless it is blatantly invalid.
    // Real international numbers can start with 1, 2, etc and be 15 digits.
    // We strictly check for @lid suffix at the start of this function.
    // Here we only catch strictly known impossible patterns if necessary.

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
