import { WAMessage } from "@whiskeysockets/baileys";
import { isValidPhoneNumber } from "libphonenumber-js";

export class WhatsAppIdUtils {
  static getCleanJid(originalJid: string | null | undefined): string | null {
    if (!originalJid) return null;

    const parts = originalJid.split("@");
    if (parts.length < 2) return null;

    const [userPart, domain] = parts;
    const cleanUser = userPart.split(":")[0];

    return `${cleanUser}@${domain}`;
  }

  static cleanChannelId(jid: string): string {
    const isGroup = this.isGroup(jid);
    const userPart = jid.replace(/@.*$/, "");
    return isGroup ? userPart : userPart.replace(/\D/g, "");
  }

  static isGroup(jid: string): boolean {
    return jid.endsWith("@g.us");
  }

  static getTargetJid(channelId: string): string {
    if (!channelId) return "";
    if (channelId.includes("@g.us")) return channelId;
    if (channelId.includes("@s.whatsapp.net")) return channelId;
    if (channelId.includes("@lid")) return channelId;
    
    if (this.isLid(channelId)) {
      return `${channelId.split("@")[0]}@lid`;
    }
    
    if (channelId.includes("-") || channelId.length > 15) {
      return `${channelId}@g.us`;
    }
    
    return `${channelId.replace(/\D/g, "")}@s.whatsapp.net`;
  }

  static isUser(jid: string): boolean {
    return jid.endsWith("@s.whatsapp.net");
  }

  static getSenderJid(message: WAMessage): string | null {
    const key = message.key;
    if (key.fromMe) {
      return this.getCleanJid(key.participant || message.participant);
    }

    if (this.isGroup(key.remoteJid || "")) {
      return this.getCleanJid(key.participant || message.participant);
    }

    return this.getCleanJid(key.remoteJid);
  }

  static getPhoneNumber(jid: string | null | undefined): string | null {
    const clean = this.getCleanJid(jid);
    if (!clean) return null;

    if (this.isGroup(clean)) return null;
    if (this.isLid(clean)) return null;

    const userPart = clean.split("@")[0].split(":")[0];

    if (userPart.startsWith("000")) return null;
    if (userPart.startsWith("40000")) return null;
    if (!/^\d+$/.test(userPart)) return null;
    if (userPart.length < 7 || userPart.length > 30) return null;

    if (!this.isRealPhoneNumber(userPart)) {
      return null;
    }

    return userPart;
  }

  static formatDisplayPhone(phone: string): string {
    if (!phone) return "Desconocido";
    return phone.startsWith("+") ? phone : `+${phone}`;
  }

  static isRealPhoneNumber(digits: string): boolean {
    if (!digits || !/^\d+$/.test(digits)) return false;

    if (this.isLid(digits)) return false;

    if (digits.length >= 15 && digits.startsWith("120")) return false;

    if (digits.length < 7 || digits.length > 15) return false;
    
    if (/^(\d)\1{6,}$/.test(digits)) return false;

    if (/^0?123456789/.test(digits)) return false;

    return true;
  }

  static isValidCrmPhone(value: string | null | undefined): boolean {
    if (!value) return false;
    const digits = String(value).replace(/\D/g, "");

    if (!this.isRealPhoneNumber(digits)) return false;
    if (digits.length > 13) return false;

    try {
      if (!isValidPhoneNumber(`+${digits}`)) return false;
    } catch {
      return false;
    }

    return true;
  }

  static isLid(jid: string): boolean {
    if (!jid) return false;
    if (jid.includes("@lid")) return true;
    if (jid.includes("@g.us")) return false;

    const userPart = jid.split("@")[0].split(":")[0];

    if (!/^\d+$/.test(userPart)) return false;

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
      
      if (userPart.length > 15) return true;
    }

    return false;
  }

  static extractDisplayPhone(
    phone: string | null | undefined,
    channelId: string | null | undefined,
    conversationChannelId: string | null | undefined,
  ): string | null {
    if (phone) {
      const cleaned = this.getPhoneNumber(phone);
      if (cleaned) return this.formatDisplayPhone(cleaned);
    }

    if (channelId) {
      const fromChannel = this.getPhoneNumber(channelId + "@s.whatsapp.net");
      if (fromChannel) return this.formatDisplayPhone(fromChannel);
    }

    if (conversationChannelId) {
      const fromConv = this.getPhoneNumber(
        conversationChannelId + "@s.whatsapp.net",
      );
      if (fromConv) return this.formatDisplayPhone(fromConv);
    }

    return null;
  }
}
