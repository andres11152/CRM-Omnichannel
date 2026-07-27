import { WhatsAppIdUtils } from "../src/whatsapp/utils/WhatsAppIdUtils";

describe("WhatsAppIdUtils", () => {
  describe("getCleanJid", () => {
    it("strips the :device suffix from a user JID", () => {
      expect(WhatsAppIdUtils.getCleanJid("573001234567:12@s.whatsapp.net")).toBe(
        "573001234567@s.whatsapp.net",
      );
    });

    it("leaves a JID with no device suffix unchanged", () => {
      expect(WhatsAppIdUtils.getCleanJid("573001234567@s.whatsapp.net")).toBe(
        "573001234567@s.whatsapp.net",
      );
    });

    it("returns null for null/undefined/malformed input", () => {
      expect(WhatsAppIdUtils.getCleanJid(null)).toBeNull();
      expect(WhatsAppIdUtils.getCleanJid(undefined)).toBeNull();
      expect(WhatsAppIdUtils.getCleanJid("not-a-jid")).toBeNull();
    });
  });

  describe("isGroup / isUser", () => {
    it("identifies group JIDs by the @g.us suffix", () => {
      expect(WhatsAppIdUtils.isGroup("123456-789@g.us")).toBe(true);
      expect(WhatsAppIdUtils.isGroup("573001234567@s.whatsapp.net")).toBe(false);
    });

    it("identifies user JIDs by the @s.whatsapp.net suffix", () => {
      expect(WhatsAppIdUtils.isUser("573001234567@s.whatsapp.net")).toBe(true);
      expect(WhatsAppIdUtils.isUser("123456-789@g.us")).toBe(false);
    });
  });

  describe("isLid", () => {
    it("flags an explicit @lid suffix regardless of digits", () => {
      expect(WhatsAppIdUtils.isLid("123@lid")).toBe(true);
    });

    it("never flags a group JID as a LID even if the prefix looks similar", () => {
      expect(WhatsAppIdUtils.isLid("102123456789012@g.us")).toBe(false);
    });

    it("flags a 14-digit id starting with 45 as a LID", () => {
      expect(WhatsAppIdUtils.isLid("45123456789012")).toBe(true);
    });

    it("flags 15+ digit ids with known LID-block prefixes", () => {
      for (const prefix of ["102", "103", "137", "112", "245", "274", "656", "159", "122"]) {
        const candidate = `${prefix}${"1".repeat(15 - prefix.length)}`;
        expect(candidate.length).toBe(15);
        expect(WhatsAppIdUtils.isLid(candidate)).toBe(true);
      }
    });

    it("flags any id longer than 15 digits as a LID", () => {
      expect(WhatsAppIdUtils.isLid("1".repeat(16))).toBe(true);
    });

    it("does not flag an ordinary 10-13 digit phone number as a LID", () => {
      expect(WhatsAppIdUtils.isLid("573001234567")).toBe(false);
    });

    it("returns false for empty/non-numeric input", () => {
      expect(WhatsAppIdUtils.isLid("")).toBe(false);
      expect(WhatsAppIdUtils.isLid("abc@s.whatsapp.net")).toBe(false);
    });
  });

  describe("getTargetJid", () => {
    it("passes through an already-suffixed group JID unchanged", () => {
      expect(WhatsAppIdUtils.getTargetJid("123-456@g.us")).toBe("123-456@g.us");
    });

    it("passes through an already-suffixed user JID unchanged", () => {
      expect(WhatsAppIdUtils.getTargetJid("573001234567@s.whatsapp.net")).toBe(
        "573001234567@s.whatsapp.net",
      );
    });

    it("passes through an already-suffixed LID JID unchanged", () => {
      expect(WhatsAppIdUtils.getTargetJid("123@lid")).toBe("123@lid");
    });

    it("appends @g.us for a bare group-shaped id (hyphenated or long)", () => {
      expect(WhatsAppIdUtils.getTargetJid("123456789-987654321")).toBe(
        "123456789-987654321@g.us",
      );
    });

    it("appends @lid for a bare id that looks like a LID", () => {
      expect(WhatsAppIdUtils.getTargetJid("45123456789012")).toBe("45123456789012@lid");
    });

    it("strips non-digits and appends @s.whatsapp.net for a plain phone number", () => {
      expect(WhatsAppIdUtils.getTargetJid("573001234567")).toBe(
        "573001234567@s.whatsapp.net",
      );
    });

    it("returns empty string for empty input", () => {
      expect(WhatsAppIdUtils.getTargetJid("")).toBe("");
    });

    // [CHARACTERIZATION] The group-detection heuristic (`length > 15`) counts
    // ALL characters, not just digits. A phone number formatted with spaces/+
    // (e.g. copy-pasted from a contact card) can cross that threshold and get
    // misrouted to "...@g.us" instead of "...@s.whatsapp.net". Callers must
    // pass a pre-cleaned digit string, not a human-formatted number.
    it("quirk: a human-formatted (spaced) number long enough can be misrouted as a group JID", () => {
      expect(WhatsAppIdUtils.getTargetJid("+57 300 123 4567")).toBe(
        "+57 300 123 4567@g.us",
      );
    });
  });

  describe("getPhoneNumber", () => {
    it("extracts a clean phone number from a user JID", () => {
      expect(WhatsAppIdUtils.getPhoneNumber("573001234567@s.whatsapp.net")).toBe(
        "573001234567",
      );
    });

    it("returns null for a group JID", () => {
      expect(WhatsAppIdUtils.getPhoneNumber("123-456@g.us")).toBeNull();
    });

    it("returns null for a LID JID (LIDs are not real phone numbers)", () => {
      expect(WhatsAppIdUtils.getPhoneNumber("123456789012345@lid")).toBeNull();
    });

    it("returns null for WhatsApp's internal placeholder prefixes", () => {
      expect(WhatsAppIdUtils.getPhoneNumber("000123@s.whatsapp.net")).toBeNull();
      expect(WhatsAppIdUtils.getPhoneNumber("40000123@s.whatsapp.net")).toBeNull();
    });

    it("returns null for an implausible/too-short or too-long number", () => {
      expect(WhatsAppIdUtils.getPhoneNumber("123@s.whatsapp.net")).toBeNull();
    });
  });

  describe("isRealPhoneNumber", () => {
    it("accepts a normal-length numeric string", () => {
      expect(WhatsAppIdUtils.isRealPhoneNumber("573001234567")).toBe(true);
    });

    it("rejects a LID-shaped digit string", () => {
      expect(WhatsAppIdUtils.isRealPhoneNumber("45123456789012")).toBe(false);
    });

    it("rejects repeated-digit junk (e.g. 1111111)", () => {
      expect(WhatsAppIdUtils.isRealPhoneNumber("11111111")).toBe(false);
    });

    it("rejects sequential junk starting with 123456789", () => {
      expect(WhatsAppIdUtils.isRealPhoneNumber("123456789")).toBe(false);
    });

    it("rejects non-numeric input", () => {
      expect(WhatsAppIdUtils.isRealPhoneNumber("57abc")).toBe(false);
    });
  });

  describe("isValidCrmPhone", () => {
    it("accepts a real, plausible international number", () => {
      expect(WhatsAppIdUtils.isValidCrmPhone("573001234567")).toBe(true);
    });

    it("rejects null/undefined", () => {
      expect(WhatsAppIdUtils.isValidCrmPhone(null)).toBe(false);
      expect(WhatsAppIdUtils.isValidCrmPhone(undefined)).toBe(false);
    });

    it("rejects a LID masquerading as a phone", () => {
      expect(WhatsAppIdUtils.isValidCrmPhone("45123456789012")).toBe(false);
    });

    it("rejects a number over 13 digits", () => {
      expect(WhatsAppIdUtils.isValidCrmPhone("12345678901234")).toBe(false);
    });
  });

  describe("formatDisplayPhone", () => {
    it("prefixes a bare number with +", () => {
      expect(WhatsAppIdUtils.formatDisplayPhone("573001234567")).toBe("+573001234567");
    });

    it("leaves an already-prefixed number unchanged", () => {
      expect(WhatsAppIdUtils.formatDisplayPhone("+573001234567")).toBe("+573001234567");
    });

    it("falls back to a placeholder for empty input", () => {
      expect(WhatsAppIdUtils.formatDisplayPhone("")).toBe("Desconocido");
    });
  });

  describe("getSenderJid", () => {
    it("resolves fromMe messages via key.participant", () => {
      const message = {
        key: { fromMe: true, participant: "573001234567:1@s.whatsapp.net", remoteJid: "123-456@g.us" },
      } as unknown as Parameters<typeof WhatsAppIdUtils.getSenderJid>[0];
      expect(WhatsAppIdUtils.getSenderJid(message)).toBe("573001234567@s.whatsapp.net");
    });

    it("resolves group messages via key.participant (the actual sender, not the group)", () => {
      const message = {
        key: { fromMe: false, participant: "573009876543:1@s.whatsapp.net", remoteJid: "123-456@g.us" },
      } as unknown as Parameters<typeof WhatsAppIdUtils.getSenderJid>[0];
      expect(WhatsAppIdUtils.getSenderJid(message)).toBe("573009876543@s.whatsapp.net");
    });

    it("resolves direct-chat messages via key.remoteJid", () => {
      const message = {
        key: { fromMe: false, remoteJid: "573001234567:1@s.whatsapp.net" },
      } as unknown as Parameters<typeof WhatsAppIdUtils.getSenderJid>[0];
      expect(WhatsAppIdUtils.getSenderJid(message)).toBe("573001234567@s.whatsapp.net");
    });
  });

  describe("extractDisplayPhone", () => {
    // [CHARACTERIZATION — LATENT BUG] `phone` is run through getPhoneNumber()
    // unmodified, but getPhoneNumber() requires a JID-shaped "user@domain"
    // string (it delegates to getCleanJid(), which bails on anything without
    // an "@"). channelId/conversationChannelId are deliberately suffixed with
    // "@s.whatsapp.net" before that same call, but the `phone` argument is
    // not — so a bare digit string (exactly what Contact.phone holds in the
    // DB, and exactly what backend/src/types/ticket.types.ts:211 passes here)
    // is silently rejected and this branch never actually contributes. In
    // practice the function always falls through to channelId. Not fixed
    // here — flagged for a maintainer to decide whether callers should
    // pre-suffix `phone` or the function should suffix it internally like
    // the other two params.
    it("quirk: a bare digit-string phone (no @ suffix) is silently ignored, not resolved", () => {
      expect(WhatsAppIdUtils.extractDisplayPhone("573001234567", null, null)).toBeNull();
    });

    it("resolves phone correctly when it's already JID-shaped", () => {
      expect(
        WhatsAppIdUtils.extractDisplayPhone("573001234567@s.whatsapp.net", null, null),
      ).toBe("+573001234567");
    });

    it("falls back to channelId when phone is absent", () => {
      expect(WhatsAppIdUtils.extractDisplayPhone(null, "573001234567", null)).toBe(
        "+573001234567",
      );
    });

    it("falls back to conversationChannelId as a last resort", () => {
      expect(
        WhatsAppIdUtils.extractDisplayPhone(null, null, "573001234567"),
      ).toBe("+573001234567");
    });

    it("returns null when none of the sources yield a real phone number", () => {
      expect(WhatsAppIdUtils.extractDisplayPhone(null, null, null)).toBeNull();
    });
  });
});
