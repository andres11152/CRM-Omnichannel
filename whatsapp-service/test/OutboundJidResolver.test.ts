import OutboundJidResolver from "../src/whatsapp/OutboundJidResolver";
import { ISessionManager } from "../src/whatsapp/interfaces";

describe("OutboundJidResolver", () => {
  const makeSessionManager = (overrides: Partial<ISessionManager> = {}): ISessionManager =>
    ({
      findContactByLid: jest.fn().mockReturnValue(undefined),
      resolveLidToPhone: jest.fn().mockResolvedValue(null),
      ...overrides,
    }) as unknown as ISessionManager;

  it("passes a group JID through unchanged", async () => {
    const sessionManager = makeSessionManager();
    const resolver = new OutboundJidResolver(sessionManager);

    const result = await resolver.resolveDestinationJid("123-456@g.us", "company1", "session1");

    expect(result).toBe("123-456@g.us");
    expect(sessionManager.findContactByLid).not.toHaveBeenCalled();
  });

  it("passes an already-suffixed user JID through unchanged", async () => {
    const sessionManager = makeSessionManager();
    const resolver = new OutboundJidResolver(sessionManager);

    const result = await resolver.resolveDestinationJid(
      "573001234567@s.whatsapp.net",
      "company1",
      "session1",
    );

    expect(result).toBe("573001234567@s.whatsapp.net");
  });

  it("resolves a bare phone number to a full user JID", async () => {
    const sessionManager = makeSessionManager();
    const resolver = new OutboundJidResolver(sessionManager);

    const result = await resolver.resolveDestinationJid("573001234567", "company1", "session1");

    expect(result).toBe("573001234567@s.whatsapp.net");
  });

  it("resolves a LID via the local memory store when the contact's real JID is known", async () => {
    const sessionManager = makeSessionManager({
      findContactByLid: jest.fn().mockReturnValue({ id: "573001234567@s.whatsapp.net" }),
    });
    const resolver = new OutboundJidResolver(sessionManager);

    // 45xxxxxxxxxxxx (14 digits, starts with 45) is a recognized LID shape.
    const result = await resolver.resolveDestinationJid(
      "45123456789012",
      "company1",
      "session1",
    );

    expect(result).toBe("573001234567@s.whatsapp.net");
    expect(sessionManager.findContactByLid).toHaveBeenCalledWith(
      "session1",
      "45123456789012@lid",
    );
    // Memory-store strategy succeeded — no need for the active-query fallback.
    expect(sessionManager.resolveLidToPhone).not.toHaveBeenCalled();
  });

  it("falls back to an active WhatsApp-server query when the memory store has no mapping", async () => {
    const sessionManager = makeSessionManager({
      findContactByLid: jest.fn().mockReturnValue(undefined),
      resolveLidToPhone: jest.fn().mockResolvedValue("573001234567"),
    });
    const resolver = new OutboundJidResolver(sessionManager);

    const result = await resolver.resolveDestinationJid(
      "45123456789012",
      "company1",
      "session1",
    );

    expect(result).toBe("573001234567@s.whatsapp.net");
    expect(sessionManager.resolveLidToPhone).toHaveBeenCalledWith(
      "session1",
      "45123456789012@lid",
    );
  });

  it("falls back to returning the raw LID JID when neither resolution strategy works", async () => {
    const sessionManager = makeSessionManager({
      findContactByLid: jest.fn().mockReturnValue(undefined),
      resolveLidToPhone: jest.fn().mockResolvedValue(null),
    });
    const resolver = new OutboundJidResolver(sessionManager);

    const result = await resolver.resolveDestinationJid(
      "45123456789012",
      "company1",
      "session1",
    );

    // Still a usable JID (Baileys can send to a LID directly) — never throws,
    // never returns an empty/undefined destination.
    expect(result).toBe("45123456789012@lid");
  });

  it("does not let an active-query rejection crash the send — falls back to the raw LID", async () => {
    const sessionManager = makeSessionManager({
      findContactByLid: jest.fn().mockReturnValue(undefined),
      resolveLidToPhone: jest.fn().mockRejectedValue(new Error("network down")),
    });
    const resolver = new OutboundJidResolver(sessionManager);

    const result = await resolver.resolveDestinationJid(
      "45123456789012",
      "company1",
      "session1",
    );

    expect(result).toBe("45123456789012@lid");
  });

  it("ignores a memory-store hit that itself resolves to another LID (doesn't loop)", async () => {
    const sessionManager = makeSessionManager({
      // Memory store returns a contact whose "id" is itself still a LID shape —
      // must not be treated as a resolved real JID.
      findContactByLid: jest.fn().mockReturnValue({ id: "45999999999999@lid" }),
      resolveLidToPhone: jest.fn().mockResolvedValue("573001234567"),
    });
    const resolver = new OutboundJidResolver(sessionManager);

    const result = await resolver.resolveDestinationJid(
      "45123456789012",
      "company1",
      "session1",
    );

    // Falls through to strategy B (active query) since strategy A's result
    // wasn't a real, resolvable JID.
    expect(result).toBe("573001234567@s.whatsapp.net");
    expect(sessionManager.resolveLidToPhone).toHaveBeenCalled();
  });
});
