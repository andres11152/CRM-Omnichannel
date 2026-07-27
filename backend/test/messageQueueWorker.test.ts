// Regression test for the outbound-status bug fix: a permanently-failed
// BullMQ job used to mark the DB message row FAILED but never told the
// frontend — the agent's UI kept showing the message stuck in "queued"
// forever. This exercises both the permanent-failure handler (worker.on
// ("failed", ...), captured the same way cronQueueService.test.ts captures
// its processor) and the anti-ban-block synchronous failure path inside
// processMessage(), asserting emitMessageStatus(..., "failed", ticketId) is
// called in both cases.

let capturedFailedHandler: ((job: unknown, err: Error) => Promise<void>) | null = null;

jest.mock("bullmq", () => ({
  Worker: jest.fn().mockImplementation(() => ({
    on: jest.fn((event: string, handler: (job: unknown, err: Error) => Promise<void>) => {
      if (event === "failed") capturedFailedHandler = handler;
    }),
    close: jest.fn(),
  })),
}));

jest.mock("@/config/bullmq", () => ({ connection: {} }));

jest.mock("@/services/queue/messageQueueService", () => ({
  messageQueueService: {
    onQueueEvicted: jest.fn(),
  },
}));

jest.mock("@/repositories/MessageRepository", () => ({
  messageRepository: {
    update: jest.fn(),
    findUnique: jest.fn(),
  },
}));

jest.mock("@/gateways/socketGateway", () => ({
  gateway: {},
}));

jest.mock("@/services/SocketEventEmitter", () => ({
  SocketEventEmitter: jest.fn().mockImplementation(() => ({
    emitMessageStatus: jest.fn(),
  })),
}));

import { getMessageQueueWorker } from "../src/services/queue/messageQueueWorker";
import { messageRepository } from "../src/repositories/MessageRepository";
import type { WhatsAppService } from "../src/whatsapp/WhatsAppService";
import type { Job } from "bullmq";
import type { MessageJob } from "../src/services/queue/messageQueueService";

const mockMessageRepo = messageRepository as unknown as { update: jest.Mock; findUnique: jest.Mock };

// getMessageQueueWorker() is a module-level singleton — the fake
// WhatsAppService it's constructed with is shared across every test below,
// so each test reconfigures the specific method(s) it cares about instead of
// injecting a brand new service.
const fakeWhatsAppService = {
  isCompanyConnected: jest.fn(),
  getSessions: jest.fn(),
  sendPresenceUpdate: jest.fn(),
  executeQueuedMessage: jest.fn(),
} as unknown as WhatsAppService;

function makeJob(overrides: Record<string, unknown> = {}): Job<MessageJob> {
  return {
    id: "job1",
    data: {
      companyId: "company1",
      conversationId: "conv1",
      senderId: "user1",
      to: "573001234567",
      text: "hello",
      metadata: { dbId: "db-msg-1" },
      ...overrides,
    },
    updateProgress: jest.fn().mockResolvedValue(undefined),
    discard: jest.fn().mockResolvedValue(undefined),
  } as unknown as Job<MessageJob>;
}

describe("messageQueueWorker", () => {
  const worker = getMessageQueueWorker(fakeWhatsAppService);
  // The worker's `socketEmitter` field is built once, in its constructor —
  // before the automatic `clearMocks: true` runs ahead of the first test —
  // so reaching through the SocketEventEmitter constructor mock's call
  // history would find it already cleared. Read the live instance directly.
  const socketEmitter = (worker as unknown as { socketEmitter: { emitMessageStatus: jest.Mock } })
    .socketEmitter;

  beforeEach(() => {
    jest.clearAllMocks();
    (fakeWhatsAppService.isCompanyConnected as jest.Mock).mockResolvedValue(true);
    (fakeWhatsAppService.getSessions as jest.Mock).mockResolvedValue([
      { sessionId: "sess1", status: "CONNECTED" },
    ]);
    (fakeWhatsAppService.sendPresenceUpdate as jest.Mock).mockResolvedValue(undefined);
    (fakeWhatsAppService.executeQueuedMessage as jest.Mock).mockResolvedValue({ messageId: "wa-msg-1" });
    mockMessageRepo.findUnique.mockResolvedValue(null);
  });

  describe("processMessage (private, invoked directly to bypass the DistributedLock/BullMQ machinery)", () => {
    it("sends the message and reports success", async () => {
      const job = makeJob();

      const result = await (worker as unknown as {
        processMessage: (j: Job<MessageJob>) => Promise<unknown>;
      }).processMessage(job);

      expect(fakeWhatsAppService.executeQueuedMessage).toHaveBeenCalledWith(
        "sess1",
        "573001234567",
        "hello",
        expect.objectContaining({ companyId: "company1", conversationId: "conv1", dbId: "db-msg-1" }),
      );
      expect(result).toEqual(expect.objectContaining({ success: true, messageId: "wa-msg-1" }));
    });

    it("skips re-sending a message that's already SENT/DELIVERED/READ (idempotency guard)", async () => {
      mockMessageRepo.findUnique.mockResolvedValue({
        id: "db-msg-1",
        status: "DELIVERED",
        whatsappMessageId: "wa-1",
      });
      const job = makeJob();

      const result = await (worker as unknown as {
        processMessage: (j: Job<MessageJob>) => Promise<unknown>;
      }).processMessage(job);

      expect(fakeWhatsAppService.executeQueuedMessage).not.toHaveBeenCalled();
      expect(result).toEqual(expect.objectContaining({ success: true, messageId: "wa-1" }));
    });

    it("marks the message FAILED and emits the 'failed' status event when blocked by anti-ban protection (no retry)", async () => {
      (fakeWhatsAppService.executeQueuedMessage as jest.Mock).mockRejectedValue(
        new Error("[baileys-antiban] Message blocked: too many messages"),
      );
      mockMessageRepo.update.mockResolvedValue({});
      const job = makeJob({ metadata: { dbId: "db-msg-1", originalTicketId: "ticket-1" } });

      await expect(
        (worker as unknown as { processMessage: (j: Job<MessageJob>) => Promise<unknown> }).processMessage(job),
      ).rejects.toThrow("[baileys-antiban]");

      expect(mockMessageRepo.update).toHaveBeenCalledWith("db-msg-1", { status: "FAILED" }, "company1");

      expect(socketEmitter.emitMessageStatus).toHaveBeenCalledWith(
        "db-msg-1",
        "conv1",
        "company1",
        "failed",
        "ticket-1",
      );
      expect(job.discard).toHaveBeenCalled();
    });

    it("re-throws a non-antiban error without marking the message FAILED (BullMQ will retry)", async () => {
      (fakeWhatsAppService.executeQueuedMessage as jest.Mock).mockRejectedValue(
        new Error("Connection Closed"),
      );
      const job = makeJob();

      await expect(
        (worker as unknown as { processMessage: (j: Job<MessageJob>) => Promise<unknown> }).processMessage(job),
      ).rejects.toThrow("Connection Closed");

      expect(mockMessageRepo.update).not.toHaveBeenCalled();
    });
  });

  describe("worker.on('failed') — permanent failure after all BullMQ retries are exhausted", () => {
    beforeAll(async () => {
      await worker.startWorker("company-failed-tests");
      expect(capturedFailedHandler).not.toBeNull();
    });

    it("marks the message FAILED and notifies the frontend via emitMessageStatus once retries are exhausted", async () => {
      mockMessageRepo.update.mockResolvedValue({});

      // NOTE: the "failed" handler's `companyId` is the one `startWorker()`
      // was bound with (a per-company BullMQ queue), not job.data.companyId
      // — in production these always match since a company's queue only
      // ever carries that company's jobs, so job.data.companyId is set
      // identically here for realism even though the source doesn't read it.
      const job = {
        id: "job1",
        attemptsMade: 10,
        opts: { attempts: 10 },
        data: {
          companyId: "company-failed-tests",
          conversationId: "conv1",
          senderId: "user1",
          metadata: { dbId: "db-msg-1", originalTicketId: "ticket-1" },
        },
      };

      await capturedFailedHandler!(job, new Error("final failure"));

      expect(mockMessageRepo.update).toHaveBeenCalledWith(
        "db-msg-1",
        { status: "FAILED" },
        "company-failed-tests",
      );
      expect(socketEmitter.emitMessageStatus).toHaveBeenCalledWith(
        "db-msg-1",
        "conv1",
        "company-failed-tests",
        "failed",
        "ticket-1",
      );
    });

    it("does nothing when the job still has retry attempts remaining", async () => {
      const job = {
        id: "job1",
        attemptsMade: 2,
        opts: { attempts: 10 },
        data: { companyId: "company1", conversationId: "conv1", metadata: { dbId: "db-msg-1" } },
      };

      await capturedFailedHandler!(job, new Error("transient failure"));

      expect(mockMessageRepo.update).not.toHaveBeenCalled();
    });

    it("does nothing when the job has no dbId to update (nothing to mark or notify)", async () => {
      const job = {
        id: "job1",
        attemptsMade: 10,
        opts: { attempts: 10 },
        data: { companyId: "company1", conversationId: "conv1", metadata: {} },
      };

      await capturedFailedHandler!(job, new Error("final failure"));

      expect(mockMessageRepo.update).not.toHaveBeenCalled();
    });
  });
});
