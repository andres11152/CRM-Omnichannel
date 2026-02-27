/**
 * 🧠 Contact Identity Strategy
 * Encapsulates business logic for resolving naming and identity conflicts.
 * Ensures consistent behavior across the application.
 */

export interface IdentityResult {
  /** The name to be stored in the Contact table (or null/undefined to prevent duplication) */
  contactName: string | undefined;

  /** The name to be used for User display and Ticket subjects (always has a value) */
  subjectDisplayName: string;

  /** Whether we found a valid human name */
  hasValidName: boolean;
}

export class ContactStrategy {
  /**
   * Resolves the best possible name for a contact based on available signals.
   *
   * @param phone E.164 Phone Number
   * @param pushName WhatsApp PushName (from message metadata)
   * @param isOutbound Whether the message is outbound
   */
  static resolveName(
    phone: string,
    pushName?: string,
    _isOutbound: boolean = false,
  ): IdentityResult {
    const cleanPushName = this.sanitize(pushName, phone);

    // Default: Fallback to phone
    let subjectDisplayName = phone;
    let contactName: string | undefined = undefined;

    if (cleanPushName) {
      // ✅ We have a verified human name
      const formatted = `~${cleanPushName}`;
      subjectDisplayName = formatted;
      contactName = formatted;
    }

    // Outbound logic: If we send a message to a new number, we don't know their name yet.
    // So defaults verify.

    return {
      contactName,
      subjectDisplayName,
      hasValidName: !!cleanPushName,
    };
  }

  /**
   * Sanitizes a name to ensure it's not just a phone number or garbage.
   */
  private static sanitize(
    name: string | undefined,
    phone: string,
  ): string | null {
    if (!name) return null;
    const trimmed = name.trim();
    if (!trimmed) return null;

    // Filters usage of "null", "undefined" string literals
    if (/^(null|undefined|false|true)$/i.test(trimmed)) return null;

    // Remove phone-like artifacts
    const digitsOnlyName = trimmed.replace(/\D/g, "");
    const digitsOnlyPhone = phone.replace(/\D/g, "");

    // 1. If name is exactly the phone number
    if (digitsOnlyName === digitsOnlyPhone) return null;

    // 2. If name is just a subset of the phone (e.g. "300123...")
    if (digitsOnlyName.length > 6 && digitsOnlyPhone.includes(digitsOnlyName))
      return null;

    // 3. Short garbage
    if (trimmed.length < 2) return null;

    return trimmed;
  }
}
