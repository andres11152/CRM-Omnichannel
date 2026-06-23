import { WAMessage } from "@whiskeysockets/baileys";
import { isValidPhoneNumber } from "libphonenumber-js";

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
    const isGroup = this.isGroup(jid);
    const userPart = jid.replace(/@.*$/, "");
    // [SEC] Preserve dashes for groups as legacy IDs (e.g. 57312...-123456) require them.
    return isGroup ? userPart : userPart.replace(/\D/g, "");
  }

  /**
   * Identifies if a JID belongs to a Group.
   */
  static isGroup(jid: string): boolean {
    return jid.endsWith("@g.us");
  }

  /**
   * [NEW] GET TARGET JID (Standardizer)
   * Ensures a string is converted to a full WhatsApp JID (@s.whatsapp.net or @g.us).
   */
  static getTargetJid(channelId: string): string {
    if (!channelId) return "";
    if (channelId.includes("@g.us")) return channelId;
    if (channelId.includes("@s.whatsapp.net")) return channelId;
    if (channelId.includes("@lid")) return channelId;
    
    if (this.isLid(channelId)) {
      return `${channelId.split("@")[0]}@lid`;
    }
    
    // [SEC] Heuristics for missing domain
    if (channelId.includes("-") || channelId.length > 15) {
      return `${channelId}@g.us`;
    }
    
    return `${channelId.replace(/\D/g, "")}@s.whatsapp.net`;
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

    // [SEC] LIDs are internal WhatsApp identifiers, NEVER real phone numbers.
    // Returning a LID here pollutes User.phone and the CRM Contacts list with
    // fake "numbers" (e.g. 3939223269449). Code that needs to address a LID must
    // use the JID / LID->Phone mapping path (OutboundJidResolver, saveLidPhoneMapping),
    // not this method. This is the single source of truth that keeps LIDs out of the CRM.
    if (this.isLid(clean)) return null;

    // Remove domain
    const userPart = clean.split("@")[0].split(":")[0];

    // [SEC] BLACKLIST: Known invalid patterns
    if (userPart.startsWith("000")) return null;
    if (userPart.startsWith("40000")) return null;

    // Ensure it's numeric
    if (!/^\d+$/.test(userPart)) return null;

    // Standard phone length validation (E.164: usually 15, but LIDs are 20-30)
    if (userPart.length < 7 || userPart.length > 30) return null;

    // [SEC] Final validation: must be a realistic phone number.
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

    // [SEC] 100-YEAR FIX: LIDs and Group JIDs are now STRICTLY excluded from being treated as phone numbers.
    // LIDs are internal identifiers and shouldn't be saved as 'phone' in the CRM.
    if (this.isLid(digits)) return false;

    // [SEC] Group JID Detection: WhatsApp groups often have 15-digit or longer IDs starting with 120.
    // Real phone numbers in North America (prefix 1) are exactly 11 digits. 
    // Any number 15+ digits starting with 120 is almost certainly a group JID stripped of @g.us.
    if (digits.length >= 15 && digits.startsWith("120")) return false;

    // Length validation (E.164 strictly 7-15)
    if (digits.length < 7 || digits.length > 15) return false;
    
    // Pattern 3: Repeated digits patterns (fake/test numbers)
    if (/^(\d)\1{6,}$/.test(digits)) return false;

    // Pattern 5: Sequential patterns (1234567890)
    if (/^0?123456789/.test(digits)) return false;

    return true;
  }

  /**
   * [CRM] STRICT validation for persisting a number as a CRM Contact.
   *
   * Stricter than isRealPhoneNumber on purpose: real WhatsApp/E.164 subscriber
   * numbers are 7-13 digits in practice. WhatsApp LIDs (internal identifiers) are
   * 14-19 digits and were polluting the Contacts list (e.g. 248472515174606,
   * 251432250957917). The prefix-based LID heuristic misses unknown prefixes, so we
   * also enforce a hard 13-digit ceiling here for anything that becomes a contact.
   */
  static isValidCrmPhone(value: string | null | undefined): boolean {
    if (!value) return false;
    const digits = String(value).replace(/\D/g, "");

    // Cheap pre-filter: reject obvious LIDs/groups/garbage by pattern.
    if (!this.isRealPhoneNumber(digits)) return false;
    // Real subscriber numbers don't exceed 13 digits; 14+ are LIDs / internal IDs.
    if (digits.length > 13) return false;

    // [SEC] AUTHORITATIVE CHECK: validate as a real E.164 number per libphonenumber's
    // per-country rules. This is what distinguishes a bare 13-digit LID (e.g.
    // 3939223269449, 4797495271544 — invalid for their apparent country codes) from a
    // genuine subscriber number of any country. Without it, LIDs that happen to be
    // <=13 digits slip into the CRM Contacts list. Numbers are stored without "+".
    try {
      if (!isValidPhoneNumber(`+${digits}`)) return false;
    } catch {
      return false;
    }

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
    if (!jid) return false;
    // Standard LID domain check
    if (jid.includes("@lid")) return true;

    // [SEC] CRITICAL: Groups (@g.us) are NEVER LIDs
    if (jid.includes("@g.us")) return false;

    // Extract user part for pattern analysis
    const userPart = jid.split("@")[0].split(":")[0];

    // Only check numeric patterns
    if (!/^\d+$/.test(userPart)) return false;

    /**
     * [SEC] 100-YEAR LID HEURISTICS
     * Real phone numbers (E.164) are max 15 digits.
     * WhatsApp LIDs are typically 15-18 digits and start with specific prefixes.
     * Common LID prefixes: 102..., 245..., 274..., 103...
     */
    if (userPart.length === 14 && userPart.startsWith("45")) {
      return true;
    }

    if (userPart.length >= 15) {
      if (userPart.startsWith("102") || 
          userPart.startsWith("103") || 
          userPart.startsWith("137") || 
          userPart.startsWith("112") || 
          userPart.startsWith("245") || 
          userPart.startsWith("274") ||
          userPart.startsWith("656") ||
          userPart.startsWith("159") ||
          userPart.startsWith("122")) {
        return true;
      }
      
      // If it's very long (17+), it's almost certainly a LID
      if (userPart.length > 15) return true;
    }

    return false;
  }

  /**
   * [NEW] SAFE PHONE EXTRACTION
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
