// Regression test for the conversationId-threading fix: OutboundWorker's
// success/failure callback-queue enqueue calls previously omitted
// `conversationId` entirely, so backend's outboundCallbackWorker couldn't
// resolve which conversation to emit the "message.status" socket event for
// (see backend/src/services/queue/outboundCallbackWorker.ts). This test
// captures the real BullMQ job processor function (by mocking `bullmq`'s
// `Worker` class to record the callback it's constructed with) and invokes
// it directly against fake jobs, asserting the exact payload enqueued to
// the outbound-callback queue.

const capturedProcessors: Array<(job: unknown) => Promise<unknown>> = [];

jest.mock("bullmq", () => {
  class FakeWorker {
    constructor(_name: string, processor: (job: unknown) => Promise<unknown>) {
      capturedProcessors.push(processor);
    }
    on() {
      /* no-op: OutboundWorker only registers a "ready" logger listener */
    }
  }
  class UnrecoverableError extends Error {}
  return { Worker: FakeWorker, UnrecoverableError };
});

const mockAddCallback = jest.fn().mockResolvedValue(undefined);

jest.mock("../src/config/queues", () => ({
  getOutboundCallbackQueue: () => ({ add: mockAddCallback }),
  getRedisConnection: () => ({}), // truthy stand-in, never actually used by ioredis
}));

jest.mock("../src/whatsapp", () => ({
  sessionManager: {
    findActiveSessionForCompany: jest.fn(),
  },
}));

jest.mock("../src/whatsapp/OutboundJidResolver", () => {
  return jest.fn().mockImplementation(() => ({
    resolveDestinationJid: jest.fn(async (to: string) => `${to.replace(/\D/g, "")}@s.whatsapp.net`),
  }));
});

jest.mock("@whiskeysockets/baileys", () => ({
  __esModule: true,
  default: jest.fn(),
  generateMessageID: jest.fn(() => "generated-msg-id"),
}));

import OutboundWorker from "../src/workers/OutboundWorker";
import { sessionManager } from "../src/whatsapp";

const mockSessionManager = sessionManager as unknown as {
  findActiveSessionForCompany: jest.Mock;
};

function makeJob(overrides: Record<string, unknown> = {}) {
  return {
    data: {
      type: "text",
      payload: {
        to: "573001234567",
        content: "hello",
        options: {
          companyId: "company1",
          dbId: "db-msg-1",
          conversationId: "conv-1",
        },
        ...overrides,
      },
    },
  };
}

describe("OutboundWorker", () => {
  let processor: (job: unknown) => Promise<unknown>;

  beforeAll(() => {
    new OutboundWorker();
    processor = capturedProcessors[capturedProcessors.length - 1];
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("threads conversationId into the SUCCESS callback job payload", async () => {
    const sendMessage = jest.fn().mockResolvedValue({ key: { id: "wa-msg-1" } });
    mockSessionManager.findActiveSessionForCompany.mockResolvedValue({
      sessionId: "sess1",
      socket: { sendMessage },
    });

    const result = await processor(makeJob());

    expect(result).toEqual({ success: true, messageId: "wa-msg-1" });
    expect(mockAddCallback).toHaveBeenCalledWith(
      "callback",
      expect.objectContaining({
        success: true,
        companyId: "company1",
        dbMessageId: "db-msg-1",
        conversationId: "conv-1",
        messageId: "wa-msg-1",
      }),
    );
  });

  it("threads conversationId into the FAILURE callback job payload", async () => {
    mockSessionManager.findActiveSessionForCompany.mockResolvedValue(null);

    await expect(processor(makeJob())).rejects.toThrow(
      "No active WhatsApp session for company: company1",
    );

    expect(mockAddCallback).toHaveBeenCalledWith(
      "callback",
      expect.objectContaining({
        success: false,
        companyId: "company1",
        dbMessageId: "db-msg-1",
        conversationId: "conv-1",
      }),
    );
  });

  it("still enqueues the failure callback (with conversationId) when conversationId is absent from the job", async () => {
    mockSessionManager.findActiveSessionForCompany.mockResolvedValue(null);

    await expect(
      processor(
        makeJob({
          options: { companyId: "company1", dbId: "db-msg-1" }, // no conversationId
        }),
      ),
    ).rejects.toThrow();

    expect(mockAddCallback).toHaveBeenCalledWith(
      "callback",
      expect.objectContaining({ conversationId: undefined }),
    );
  });

  it("throws UnrecoverableError for a fatal 'not on whatsapp' send failure (no BullMQ retry)", async () => {
    const sendMessage = jest.fn().mockRejectedValue(new Error("recipient is not on whatsapp"));
    mockSessionManager.findActiveSessionForCompany.mockResolvedValue({
      sessionId: "sess1",
      socket: { sendMessage },
    });

    const { UnrecoverableError } = jest.requireMock("bullmq") as { UnrecoverableError: typeof Error };
    await expect(processor(makeJob())).rejects.toBeInstanceOf(UnrecoverableError);
  });

  it("re-throws a transient send error as-is so BullMQ retries it", async () => {
    const sendMessage = jest.fn().mockRejectedValue(new Error("Connection Closed"));
    mockSessionManager.findActiveSessionForCompany.mockResolvedValue({
      sessionId: "sess1",
      socket: { sendMessage },
    });

    await expect(processor(makeJob())).rejects.toThrow("Connection Closed");
  });
});
