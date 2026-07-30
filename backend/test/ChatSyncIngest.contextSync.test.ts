// Unit tests for ChatSyncIngest.contextSync's orchestration: the cooldown
// window (which must NOT punish an infra-early-exit as harshly as a genuine
// fetch attempt) and the `failed`/`failureReason` fields on the
// conversation:history_synced socket event (which must distinguish "we
// tried and found nothing" from "we couldn't even try").

jest.useFakeTimers();

jest.mock("@/whatsapp", () => ({
  whatsappService: { getSessions: jest.fn() },
}));

jest.mock("@/gateways/socketGateway", () => ({
  gateway: { emitToCompany: jest.fn() },
}));

jest.mock("@/repositories/MessageRepository", () => ({
  messageRepository: { count: jest.fn() },
}));

jest.mock("../src/services/sync/SyncRepositoryHelper", () => ({
  syncRepositoryHelper: { getAdminUser: jest.fn() },
}));

jest.mock("../src/services/sync/ChatSyncJidResolver", () => ({
  chatSyncJidResolver: {
    resolveRealJid: jest.fn(async (_c: string, _s: string, jid: string) => jid),
    getSessionStore: jest.fn(),
    extractMessagesFromStore: jest.fn(),
  },
}));

jest.mock("../src/services/sync/ChatSyncBatchIngester", () => ({
  chatSyncBatchIngester: { ingestConversationBatch: jest.fn() },
}));

jest.mock("@whiskeysockets/baileys", () => ({
  isJidBroadcast: jest.fn().mockReturnValue(false),
}));

import { ChatSyncIngest } from "../src/services/sync/ChatSyncIngest";
import { whatsappService } from "../src/whatsapp";
import { gateway } from "@/gateways/socketGateway";
import { messageRepository } from "../src/repositories/MessageRepository";
import { syncRepositoryHelper } from "../src/services/sync/SyncRepositoryHelper";
import { chatSyncJidResolver } from "../src/services/sync/ChatSyncJidResolver";

const mockWA = whatsappService as unknown as { getSessions: jest.Mock };
const mockGateway = gateway as unknown as { emitToCompany: jest.Mock };
const mockMsgRepo = messageRepository as unknown as { count: jest.Mock };
const mockAdminHelper = syncRepositoryHelper as unknown as { getAdminUser: jest.Mock };
const mockJidResolver = chatSyncJidResolver as unknown as {
  resolveRealJid: jest.Mock;
  getSessionStore: jest.Mock;
  extractMessagesFromStore: jest.Mock;
};

const emittedHistorySyncedPayload = () => {
  const call = mockGateway.emitToCompany.mock.calls.find((c) => c[1] === "conversation:history_synced");
  return call?.[2];
};

describe("ChatSyncIngest.contextSync", () => {
  let ingest: ChatSyncIngest;
  const companyId = "company1";
  const conversationId = "conv1";
  const channelId = "573001234567";

  beforeEach(() => {
    jest.clearAllMocks();
    ingest = new ChatSyncIngest();
    // 20+ messages already in the store: no on-demand fetch needed, a clean
    // "attempted, found nothing new" pass through the batch-ingest branch.
    mockJidResolver.extractMessagesFromStore.mockReturnValue(
      Array.from({ length: 20 }, (_, i) => ({ key: { id: String(i) } })),
    );
  });

  it("marks the sync failed with reason 'no_connected_session' when there's no CONNECTED session", async () => {
    mockWA.getSessions.mockResolvedValue([{ sessionId: "s1", status: "DISCONNECTED" }]);

    await ingest.contextSync(companyId, conversationId, channelId);

    const payload = emittedHistorySyncedPayload();
    expect(payload.failed).toBe(true);
    expect(payload.failureReason).toBe("no_connected_session");
  });

  it("marks the sync failed with reason 'store_not_ready' when the session store isn't available", async () => {
    mockWA.getSessions.mockResolvedValue([{ sessionId: "s1", status: "CONNECTED" }]);
    mockJidResolver.getSessionStore.mockResolvedValue(null);

    await ingest.contextSync(companyId, conversationId, channelId);

    const payload = emittedHistorySyncedPayload();
    expect(payload.failed).toBe(true);
    expect(payload.failureReason).toBe("store_not_ready");
  });

  it("does NOT mark the sync failed when it genuinely attempted and just found nothing new", async () => {
    mockWA.getSessions.mockResolvedValue([{ sessionId: "s1", status: "CONNECTED" }]);
    mockJidResolver.getSessionStore.mockResolvedValue({});
    mockAdminHelper.getAdminUser.mockResolvedValue({ id: "admin1" });
    mockMsgRepo.count.mockResolvedValue(0);

    await ingest.contextSync(companyId, conversationId, channelId);

    const payload = emittedHistorySyncedPayload();
    expect(payload.failed).toBe(false);
    expect(payload.failureReason).toBeUndefined();
  });

  it("allows an immediate retry after an infra early-exit once the short cooldown elapses, but not before", async () => {
    mockWA.getSessions.mockResolvedValue([{ sessionId: "s1", status: "DISCONNECTED" }]);

    await ingest.contextSync(companyId, conversationId, channelId);
    expect(mockWA.getSessions).toHaveBeenCalledTimes(1);

    // Immediately retrying (session still down) should be blocked by the short cooldown.
    await ingest.contextSync(companyId, conversationId, channelId);
    expect(mockWA.getSessions).toHaveBeenCalledTimes(1);

    // Advance past the short (infra) cooldown window (30s) but stay well under
    // the full 5-minute one — this is exactly the case the fix targets.
    jest.advanceTimersByTime(31_000);

    await ingest.contextSync(companyId, conversationId, channelId);
    expect(mockWA.getSessions).toHaveBeenCalledTimes(2);
  });

  it("enforces the full cooldown (not the short one) after a genuine attempt, even with zero new messages", async () => {
    mockWA.getSessions.mockResolvedValue([{ sessionId: "s1", status: "CONNECTED" }]);
    mockJidResolver.getSessionStore.mockResolvedValue({});
    mockAdminHelper.getAdminUser.mockResolvedValue({ id: "admin1" });
    mockMsgRepo.count.mockResolvedValue(0);

    await ingest.contextSync(companyId, conversationId, channelId);
    expect(mockWA.getSessions).toHaveBeenCalledTimes(1);

    // Past the short 30s window, but a REAL attempt happened, so the full
    // 5-minute cooldown must still block this retry.
    jest.advanceTimersByTime(31_000);
    await ingest.contextSync(companyId, conversationId, channelId);
    expect(mockWA.getSessions).toHaveBeenCalledTimes(1);

    // Past the full 5-minute window, a retry is allowed again.
    jest.advanceTimersByTime(5 * 60 * 1000);
    await ingest.contextSync(companyId, conversationId, channelId);
    expect(mockWA.getSessions).toHaveBeenCalledTimes(2);
  });
});
