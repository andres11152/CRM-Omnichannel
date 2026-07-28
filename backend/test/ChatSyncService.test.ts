// Unit tests for ChatSyncService.syncMessages — the on-demand sync
// orchestrator invoked by both chatSyncController.syncConversation (agent
// opens a chat) and conversationController.syncFullHistory (manual "sync"
// button). Covers the two request shapes (targeted single-conversation vs.
// bulk company-wide), the per-lock dedup guard, and error handling — none of
// which had test coverage before this pass.

jest.mock("../src/services/sync/ChatSyncIngest", () => {
  return {
    ChatSyncIngest: jest.fn().mockImplementation(() => ({
      getSessionStore: jest.fn().mockResolvedValue(null),
      resolveRealJid: jest.fn(async (_c: string, _s: string, jid: string) => jid),
      extractMessagesFromStore: jest.fn().mockReturnValue([]),
      fetchHistoryFromWhatsApp: jest.fn().mockResolvedValue(false),
      handleHistorySync: jest.fn().mockResolvedValue(undefined),
      processMessage: jest.fn().mockResolvedValue("new"),
    })),
  };
});

jest.mock("@/gateways/socketGateway", () => ({
  gateway: { emitToCompany: jest.fn() },
}));

jest.mock("../src/services/sync/SyncRepositoryHelper", () => ({
  syncRepositoryHelper: {
    getAdminUser: jest.fn(),
  },
}));

jest.mock("@/repositories/MessageRepository", () => ({
  messageRepository: {
    count: jest.fn(),
  },
}));

// ChatSyncService only exports its singleton (`chatSyncService`), not the
// class itself, so tests share one instance — same as production. Its
// internal `ChatSyncIngest` is likewise constructed exactly once, at module
// import time (before any `beforeEach` runs), so the mock instance is
// captured once here rather than re-read from `mock.results` on every test
// (which `clearAllMocks()` would wipe even though the singleton's own
// reference to it is untouched).
import { chatSyncService } from "../src/services/ChatSyncService";
import { ChatSyncIngest } from "../src/services/sync/ChatSyncIngest";
import { gateway } from "../src/gateways/socketGateway";
import { syncRepositoryHelper } from "../src/services/sync/SyncRepositoryHelper";
import { messageRepository } from "../src/repositories/MessageRepository";

const MockChatSyncIngest = ChatSyncIngest as unknown as jest.Mock;
const mockGateway = gateway as unknown as { emitToCompany: jest.Mock };
const mockSyncRepoHelper = syncRepositoryHelper as unknown as { getAdminUser: jest.Mock };
const mockMessageRepo = messageRepository as unknown as { count: jest.Mock };
const ingestInstance = MockChatSyncIngest.mock.results[0].value;
const service = chatSyncService;

describe("ChatSyncService.syncMessages", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    ingestInstance.getSessionStore.mockResolvedValue(null);
    ingestInstance.resolveRealJid.mockImplementation(async (_c: string, _s: string, jid: string) => jid);
    ingestInstance.extractMessagesFromStore.mockReturnValue([]);
    ingestInstance.fetchHistoryFromWhatsApp.mockResolvedValue(false);
    ingestInstance.handleHistorySync.mockResolvedValue(undefined);
    ingestInstance.processMessage.mockResolvedValue("new");
    // [CHARACTERIZATION] When conversationId is set but the on-demand fetch
    // did NOT succeed, syncMessages falls through to the bulk
    // group-by-conversation branch (grouping the — likely empty —
    // memory-store messages) rather than short-circuiting, and THAT branch
    // unconditionally requires an admin user to exist as the fallback
    // sender, even when there end up being zero messages to process. Default
    // an admin here so tests can isolate the specific behavior they target;
    // one test below removes it deliberately to document this quirk.
    mockSyncRepoHelper.getAdminUser.mockResolvedValue({ id: "admin1" });
  });

  describe("targeted sync (conversationId provided — 'open a chat, backfill history')", () => {
    it("counts DB messages before/after the on-demand fetch to compute new vs. duplicate", async () => {
      ingestInstance.fetchHistoryFromWhatsApp.mockResolvedValue(true);
      mockMessageRepo.count
        .mockResolvedValueOnce(10) // dbCountBefore
        .mockResolvedValueOnce(25); // dbCountAfter

      const result = await service.syncMessages(
        {
          companyId: "company1",
          sessionId: "sess1",
          conversationId: "573001234567",
          limit: 100,
          dryRun: false,
        },
        "user1",
      );

      expect(result.success).toBe(true);
      expect(result.messagesNew).toBe(15);
      expect(result.conversationsProcessed).toBe(1);
      expect(ingestInstance.fetchHistoryFromWhatsApp).toHaveBeenCalledWith(
        "company1",
        "sess1",
        "573001234567",
        100,
        { firstPageWaitMs: 8000 },
      );
    });

    it("marks the result 'pending' when the fetch succeeded but no new messages have landed yet (still in flight)", async () => {
      ingestInstance.fetchHistoryFromWhatsApp.mockResolvedValue(true);
      mockMessageRepo.count.mockResolvedValueOnce(10).mockResolvedValueOnce(10); // no growth yet

      const result = await service.syncMessages(
        { companyId: "company1", sessionId: "sess1", conversationId: "573001234567", limit: 100, dryRun: false },
        "user1",
      );

      expect(result.pending).toBe(true);
      expect(result.messagesNew).toBe(0);
    });

    it("does not mark 'pending' when the on-demand fetch never even succeeded (e.g. no active session)", async () => {
      ingestInstance.fetchHistoryFromWhatsApp.mockResolvedValue(false);
      mockMessageRepo.count.mockResolvedValue(10);

      const result = await service.syncMessages(
        { companyId: "company1", sessionId: "sess1", conversationId: "573001234567", limit: 100, dryRun: false },
        "user1",
      );

      expect(result.pending).toBe(false);
    });

    it("rejects a second concurrent sync for the SAME conversation", async () => {
      ingestInstance.fetchHistoryFromWhatsApp.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve(true), 50)),
      );
      mockMessageRepo.count.mockResolvedValue(0);

      const request = {
        companyId: "company1",
        sessionId: "sess1",
        conversationId: "573001234567",
        limit: 100,
        dryRun: false,
      };

      const first = service.syncMessages(request, "user1");
      const second = await service.syncMessages(request, "user1");

      expect(second.success).toBe(false);
      expect(second.errors[0]).toMatch(/already running/i);

      await first; // let the first one finish so it doesn't leak into other tests
    });

    it("allows a sync for a DIFFERENT conversation to run concurrently (per-conversation lock, not per-company)", async () => {
      ingestInstance.fetchHistoryFromWhatsApp.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve(true), 30)),
      );
      mockMessageRepo.count.mockResolvedValue(0);

      const firstPromise = service.syncMessages(
        { companyId: "company1", sessionId: "sess1", conversationId: "573001111111", limit: 100, dryRun: false },
        "user1",
      );
      const secondResult = await service.syncMessages(
        { companyId: "company1", sessionId: "sess1", conversationId: "573002222222", limit: 100, dryRun: false },
        "user1",
      );

      expect(secondResult.success).toBe(true);
      await firstPromise;
    });

    it("releases the lock after completion so a later sync for the same conversation is allowed", async () => {
      ingestInstance.fetchHistoryFromWhatsApp.mockResolvedValue(true);
      mockMessageRepo.count.mockResolvedValue(0);

      const request = {
        companyId: "company1",
        sessionId: "sess1",
        conversationId: "573001234567",
        limit: 100,
        dryRun: false,
      };

      const firstResult = await service.syncMessages(request, "user1");
      const secondResult = await service.syncMessages(request, "user1");

      expect(firstResult.success).toBe(true);
      expect(secondResult.success).toBe(true);
    });

    it("emits started/completed progress events over the socket", async () => {
      ingestInstance.fetchHistoryFromWhatsApp.mockResolvedValue(true);
      mockMessageRepo.count.mockResolvedValue(0);

      await service.syncMessages(
        { companyId: "company1", sessionId: "sess1", conversationId: "573001234567", limit: 100, dryRun: false },
        "user1",
      );

      const statuses = mockGateway.emitToCompany.mock.calls.map((c) => (c[2] as { status: string }).status);
      expect(statuses).toContain("started");
      expect(statuses).toContain("completed");
    });

    it("returns a failed result (not a thrown error) and still releases the lock when the fetch throws", async () => {
      ingestInstance.fetchHistoryFromWhatsApp.mockRejectedValue(new Error("network down"));

      const request = {
        companyId: "company1",
        sessionId: "sess1",
        conversationId: "573001234567",
        limit: 100,
        dryRun: false,
      };

      const result = await service.syncMessages(request, "user1");
      expect(result.success).toBe(false);
      expect(result.errors[0]).toMatch(/network down/);

      // Lock was released in `finally` — a retry must be allowed, not rejected as "already running".
      mockMessageRepo.count.mockResolvedValue(0);
      ingestInstance.fetchHistoryFromWhatsApp.mockResolvedValue(true);
      const retry = await service.syncMessages(request, "user1");
      expect(retry.errors).not.toEqual(expect.arrayContaining([expect.stringMatching(/already running/i)]));
    });
  });

  describe("bulk sync (no conversationId — company-wide from-memory-store sweep)", () => {
    it("fails with an explicit error when no admin user exists for the company (no fallback sender)", async () => {
      mockSyncRepoHelper.getAdminUser.mockResolvedValue(null);
      ingestInstance.extractMessagesFromStore.mockReturnValue([
        { key: { remoteJid: "573001234567@s.whatsapp.net" }, messageTimestamp: 1000 },
      ]);

      const result = await service.syncMessages(
        { companyId: "company1", sessionId: "sess1", limit: 500, dryRun: false },
        "user1",
      );

      expect(result.success).toBe(false);
      expect(result.errors[0]).toMatch(/no admin user found/i);
    });

    it("groups messages by conversation and processes each one via the ingest's processMessage", async () => {
      mockSyncRepoHelper.getAdminUser.mockResolvedValue({ id: "admin1" });
      ingestInstance.extractMessagesFromStore.mockReturnValue([
        { key: { remoteJid: "573001111111@s.whatsapp.net" }, messageTimestamp: 1000 },
        { key: { remoteJid: "573002222222@s.whatsapp.net" }, messageTimestamp: 1001 },
      ]);
      ingestInstance.processMessage.mockResolvedValue("new");

      const result = await service.syncMessages(
        { companyId: "company1", sessionId: "sess1", limit: 500, dryRun: false },
        "user1",
      );

      expect(result.success).toBe(true);
      expect(result.conversationsProcessed).toBe(2);
      expect(result.messagesNew).toBe(2);
      expect(ingestInstance.processMessage).toHaveBeenCalledTimes(2);
    });

    it("isolates a per-message processing failure as an error entry instead of aborting the whole sync", async () => {
      mockSyncRepoHelper.getAdminUser.mockResolvedValue({ id: "admin1" });
      ingestInstance.extractMessagesFromStore.mockReturnValue([
        { key: { remoteJid: "573001111111@s.whatsapp.net", id: "m1" }, messageTimestamp: 1000 },
      ]);
      ingestInstance.processMessage.mockRejectedValue(new Error("constraint violation"));

      const result = await service.syncMessages(
        { companyId: "company1", sessionId: "sess1", limit: 500, dryRun: false },
        "user1",
      );

      expect(result.success).toBe(true); // the overall sync still "succeeds"
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toMatch(/constraint violation/);
    });
  });

  describe("getSyncStatus / isSyncRunning", () => {
    it("reports not running before any sync starts", () => {
      expect(service.getSyncStatus("company1")).toEqual({ running: false });
    });

    it("reports running while a targeted sync's lock is held", async () => {
      // Block on the FIRST await inside syncMessages (getSessionStore) rather
      // than a later one (e.g. fetchHistoryFromWhatsApp) — the lock is set
      // synchronously before any await, so blocking on the first one lets a
      // plain synchronous check (no microtask-flushing needed) reliably
      // observe the lock while it's held. Blocking on a LATER await would
      // race: the check would run before that call was even reached yet, so
      // resolving "release" would target a stale promise nothing awaits.
      let releaseStore: (v: null) => void = () => {};
      ingestInstance.getSessionStore.mockImplementation(
        () => new Promise((resolve) => { releaseStore = resolve; }),
      );
      mockMessageRepo.count.mockResolvedValue(0);

      const promise = service.syncMessages(
        { companyId: "company1", sessionId: "sess1", conversationId: "573001234567", limit: 100, dryRun: false },
        "user1",
      );

      // Lock key for a targeted sync is `${companyId}:${conversationId}`, not
      // the bare companyId — isSyncRunning(companyId) checks the bare key.
      expect(service.isSyncRunning("company1:573001234567")).toBe(true);

      releaseStore(null);
      await promise;
    });
  });
});
