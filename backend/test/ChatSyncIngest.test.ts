// Unit tests for the on-demand WhatsApp history sync fetch logic
// (ChatSyncIngest.fetchHistoryFromWhatsApp), the function that actually
// issues the "give me older messages" request to the phone via
// whatsapp-service. This file already carries extensive comments documenting
// two previously-fixed "no funciona" bugs (timestamp unit mismatch, missing
// 50-message-per-query cap) — these tests pin down that both fixes hold and
// cover the surrounding orchestration (anchor resolution, pagination cap,
// fallback, error handling) that had zero test coverage before this pass.
//
// These use REAL timers (not fake) — the function under test has a hardcoded
// polling interval, and requesting exactly as many messages as the mocked DB
// count grows by (limit === firstGained) keeps `firstGained < limit` false,
// which avoids triggering the background/detached re-pagination continuation
// that would otherwise keep polling for up to ~19s in the background after
// the awaited call already returned.

jest.mock("@/whatsapp", () => ({
  whatsappService: {
    listSessions: jest.fn(),
  },
}));

jest.mock("@/whatsapp/utils/whatsAppServiceHttp", () => ({
  executeWhatsAppCommand: jest.fn(),
}));

jest.mock("@/repositories/MessageRepository", () => ({
  messageRepository: {
    count: jest.fn(),
    findFirst: jest.fn(),
  },
}));

jest.mock("../src/services/sync/ChatSyncJidResolver", () => ({
  chatSyncJidResolver: {
    resolveRealJid: jest.fn(),
    getSessionStore: jest.fn(),
    extractMessagesFromStore: jest.fn().mockReturnValue([]),
  },
}));

jest.mock("../src/services/sync/ChatSyncBatchIngester", () => ({
  chatSyncBatchIngester: {
    ingestConversationBatch: jest.fn(),
  },
}));

// ChatSyncIngest.ts imports `isJidBroadcast` from @whiskeysockets/baileys at
// module top-level (used only by runHistorySync, not by
// fetchHistoryFromWhatsApp under test here), and the real package ships ESM
// source Jest's CommonJS transform can't parse. Stub just enough surface.
jest.mock("@whiskeysockets/baileys", () => ({
  isJidBroadcast: jest.fn().mockReturnValue(false),
}));

import { ChatSyncIngest } from "../src/services/sync/ChatSyncIngest";
import { whatsappService } from "../src/whatsapp";
import { executeWhatsAppCommand } from "../src/whatsapp/utils/whatsAppServiceHttp";
import { messageRepository } from "../src/repositories/MessageRepository";
import { chatSyncJidResolver } from "../src/services/sync/ChatSyncJidResolver";

const mockWhatsAppService = whatsappService as unknown as { listSessions: jest.Mock };
const mockExecuteCommand = executeWhatsAppCommand as jest.Mock;
const mockMessageRepo = messageRepository as unknown as { count: jest.Mock; findFirst: jest.Mock };
const mockJidResolver = chatSyncJidResolver as unknown as {
  resolveRealJid: jest.Mock;
  getSessionStore: jest.Mock;
  extractMessagesFromStore: jest.Mock;
};

describe("ChatSyncIngest.fetchHistoryFromWhatsApp", () => {
  let ingest: ChatSyncIngest;

  beforeEach(() => {
    jest.clearAllMocks();
    ingest = new ChatSyncIngest();

    mockWhatsAppService.listSessions.mockResolvedValue([
      { sessionId: "sess1", status: "CONNECTED" },
    ]);
    mockJidResolver.resolveRealJid.mockImplementation(async (_c, _s, jid) => jid);
    mockJidResolver.getSessionStore.mockResolvedValue(null);
    mockMessageRepo.findFirst.mockResolvedValue(null); // no DB anchor — unanchored fallback
  });

  it("returns false immediately when the company has no CONNECTED session (no phone to ask)", async () => {
    mockWhatsAppService.listSessions.mockResolvedValue([{ sessionId: "sess1", status: "DISCONNECTED" }]);

    const result = await ingest.fetchHistoryFromWhatsApp("company1", "sess1", "573001234567", 50);

    expect(result).toBe(false);
    expect(mockExecuteCommand).not.toHaveBeenCalled();
  });

  it("returns true immediately (no polling wait) when the socket had to use the presenceSubscribe fallback", async () => {
    mockMessageRepo.count.mockResolvedValue(0);
    mockExecuteCommand.mockResolvedValue({ usedFallback: true });

    const result = await ingest.fetchHistoryFromWhatsApp("company1", "sess1", "573001234567", 50);

    expect(result).toBe(true);
    // The pre-count is read once (before the fallback check short-circuits),
    // but no polling/waiting for growth ever happens after that.
    expect(mockMessageRepo.count).toHaveBeenCalledTimes(1);
  });

  it("returns false (not throw) when whatsapp-service's command call itself fails", async () => {
    mockExecuteCommand.mockRejectedValue(new Error("whatsapp-service unreachable"));

    const result = await ingest.fetchHistoryFromWhatsApp("company1", "sess1", "573001234567", 50);

    expect(result).toBe(false);
  });

  describe("once the phone actually answers (page 1 count grows by exactly `limit`)", () => {
    // Growing by exactly `limit` keeps `firstGained < limit` false, so the
    // background re-pagination continuation is never scheduled — keeps these
    // tests fast and side-effect-free after they return.
    function mockGrowthBy(amount: number) {
      let called = false;
      mockMessageRepo.count.mockImplementation(async () => {
        if (!called) {
          called = true;
          return 10; // preDbCount
        }
        return 10 + amount; // grown on first poll
      });
    }

    it("[REGRESSION] never requests more than 50 messages per query (phone-enforced cap) even when a larger limit is requested", async () => {
      mockExecuteCommand.mockResolvedValue({ usedFallback: false });
      // Growth reported == the requested `limit` (not the phone-enforced 50
      // cap) keeps `firstGained < limit` false, so the background
      // re-pagination continuation is never scheduled — this mock doesn't
      // need to faithfully model how many messages a single 50-message
      // request could realistically deliver; it only needs to isolate the
      // one thing under test here: the actual `count` argument sent to
      // whatsapp-service must be clamped to 50 regardless of `limit`.
      mockGrowthBy(500);

      const result = await ingest.fetchHistoryFromWhatsApp("company1", "sess1", "573001234567", 500);

      expect(result).toBe(true);
      expect(mockExecuteCommand).toHaveBeenCalledWith(
        "company1",
        "fetchMessageHistory",
        [50, expect.anything(), expect.anything()],
      );
    }, 10000);

    it("[REGRESSION] forwards the anchor timestamp in MILLISECONDS (DB tier: createdAt.getTime()), never raw seconds", async () => {
      const createdAt = new Date("2024-06-15T12:00:00.000Z");
      mockMessageRepo.findFirst.mockResolvedValue({
        whatsappMessageId: "wa-anchor-1",
        direction: "INBOUND",
        createdAt,
      });
      mockExecuteCommand.mockResolvedValue({ usedFallback: false });
      mockGrowthBy(5);

      await ingest.fetchHistoryFromWhatsApp("company1", "sess1", "573001234567", 5);

      expect(mockExecuteCommand).toHaveBeenCalledWith(
        "company1",
        "fetchMessageHistory",
        [
          5,
          expect.objectContaining({ id: "wa-anchor-1", fromMe: false }),
          createdAt.getTime(), // must be ms — this is exactly the unit past bug
        ],
      );
    }, 10000);

    it("uses the DB's oldest message as the pagination anchor when one exists, mapping OUTBOUND direction to fromMe: true", async () => {
      mockMessageRepo.findFirst.mockResolvedValue({
        whatsappMessageId: "wa-anchor-1",
        direction: "OUTBOUND",
        createdAt: new Date("2024-01-01T00:00:00.000Z"),
      });
      mockExecuteCommand.mockResolvedValue({ usedFallback: false });
      mockGrowthBy(5);

      await ingest.fetchHistoryFromWhatsApp("company1", "sess1", "573001234567", 5);

      const [, key] = mockExecuteCommand.mock.calls[0][2] as [number, { fromMe: boolean; id: string }, number];
      expect(key.fromMe).toBe(true);
      expect(key.id).toBe("wa-anchor-1");
    }, 10000);

    it("falls back to an unanchored request (empty id, ts 0) when there's no DB row and no memory store", async () => {
      mockExecuteCommand.mockResolvedValue({ usedFallback: false });
      mockGrowthBy(5);

      await ingest.fetchHistoryFromWhatsApp("company1", "sess1", "573001234567", 5);

      expect(mockExecuteCommand).toHaveBeenCalledWith(
        "company1",
        "fetchMessageHistory",
        [5, expect.objectContaining({ id: "", fromMe: false }), 0],
      );
    }, 10000);

    it("resolves the real (possibly LID) JID before requesting, and uses it as the remoteJid on the anchor key", async () => {
      mockJidResolver.resolveRealJid.mockResolvedValue("45123456789012@lid");
      mockExecuteCommand.mockResolvedValue({ usedFallback: false });
      mockGrowthBy(5);

      await ingest.fetchHistoryFromWhatsApp("company1", "sess1", "573001234567", 5);

      expect(mockJidResolver.resolveRealJid).toHaveBeenCalledWith(
        "company1",
        "sess1",
        "573001234567@s.whatsapp.net",
      );
      const [, key] = mockExecuteCommand.mock.calls[0][2] as [number, { remoteJid: string }];
      expect(key.remoteJid).toBe("45123456789012@lid");
    }, 10000);

    it("returns true once growth is detected within the bounded wait", async () => {
      mockExecuteCommand.mockResolvedValue({ usedFallback: false });
      mockGrowthBy(5);

      const result = await ingest.fetchHistoryFromWhatsApp("company1", "sess1", "573001234567", 5);

      expect(result).toBe(true);
    }, 10000);
  });
});
