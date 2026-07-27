// Regression test for the outbound-status bug fix: this worker consumes
// whatsapp-service's outbound-callback queue and is the ONLY place that
// converts the AI/flow-triggered send path's real Baileys outcome into a DB
// status update + socket event. Before the fix it emitted the wrong event
// name/payload shape; it also now threads the conversationId that
// whatsapp-service's OutboundWorker started including in the callback job
// (see whatsapp-service/src/workers/OutboundWorker.ts), falling back to the
// updated row's own conversationId on the success path only (there's no row
// to read it from on the failure path).

const capturedProcessors: Array<(job: unknown) => Promise<void>> = [];

jest.mock("bullmq", () => ({
  Worker: jest.fn().mockImplementation((_name: string, processor: (job: unknown) => Promise<void>) => {
    capturedProcessors.push(processor);
    return { on: jest.fn(), close: jest.fn() };
  }),
}));

jest.mock("@/repositories/MessageRepository", () => ({
  messageRepository: {
    update: jest.fn(),
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

jest.mock("@/config/redis", () => ({
  __esModule: true,
  default: {}, // truthy stand-in so the constructor's "Redis not initialized" guard passes
}));

import { OutboundCallbackWorker } from "../src/services/queue/outboundCallbackWorker";
import { messageRepository } from "../src/repositories/MessageRepository";

const mockMessageRepo = messageRepository as unknown as { update: jest.Mock };

function makeJob(data: Record<string, unknown>) {
  return { id: "job1", data };
}

describe("OutboundCallbackWorker", () => {
  let processor: (job: unknown) => Promise<void>;
  let socketEmitter: { emitMessageStatus: jest.Mock };

  beforeAll(() => {
    const worker = new OutboundCallbackWorker();
    processor = capturedProcessors[capturedProcessors.length - 1];
    socketEmitter = (worker as unknown as { socketEmitter: { emitMessageStatus: jest.Mock } }).socketEmitter;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("skips processing entirely when the callback job has no dbMessageId", async () => {
    await processor(makeJob({ success: true, companyId: "company1" }));

    expect(mockMessageRepo.update).not.toHaveBeenCalled();
    expect(socketEmitter.emitMessageStatus).not.toHaveBeenCalled();
  });

  describe("success callback", () => {
    it("marks the message SENT and emits 'sent' using the conversationId threaded from whatsapp-service", async () => {
      mockMessageRepo.update.mockResolvedValue({ id: "db-msg-1", conversationId: "conv-from-db" });

      await processor(
        makeJob({
          success: true,
          companyId: "company1",
          sessionId: "sess1",
          messageId: "wa-real-id",
          dbMessageId: "db-msg-1",
          conversationId: "conv-threaded",
        }),
      );

      expect(mockMessageRepo.update).toHaveBeenCalledWith(
        "db-msg-1",
        { status: "SENT", whatsappMessageId: "wa-real-id" },
        "company1",
      );
      // The threaded conversationId takes priority over the DB row's own —
      // it's fresher and avoids a second lookup.
      expect(socketEmitter.emitMessageStatus).toHaveBeenCalledWith(
        "db-msg-1",
        "conv-threaded",
        "company1",
        "sent",
      );
    });

    it("falls back to the updated row's own conversationId when the job predates the conversationId-threading fix", async () => {
      mockMessageRepo.update.mockResolvedValue({ id: "db-msg-1", conversationId: "conv-from-db" });

      await processor(
        makeJob({
          success: true,
          companyId: "company1",
          sessionId: "sess1",
          messageId: "wa-real-id",
          dbMessageId: "db-msg-1",
          // no conversationId field at all
        }),
      );

      expect(socketEmitter.emitMessageStatus).toHaveBeenCalledWith(
        "db-msg-1",
        "conv-from-db",
        "company1",
        "sent",
      );
    });

    it("does not emit anything when neither the job nor the updated row has a conversationId", async () => {
      mockMessageRepo.update.mockResolvedValue({ id: "db-msg-1", conversationId: null });

      await processor(
        makeJob({ success: true, companyId: "company1", dbMessageId: "db-msg-1" }),
      );

      expect(socketEmitter.emitMessageStatus).not.toHaveBeenCalled();
    });

    it("stores null (not undefined) for whatsappMessageId when the job carries no messageId", async () => {
      mockMessageRepo.update.mockResolvedValue({ id: "db-msg-1", conversationId: "conv1" });

      await processor(
        makeJob({ success: true, companyId: "company1", dbMessageId: "db-msg-1" }),
      );

      expect(mockMessageRepo.update).toHaveBeenCalledWith(
        "db-msg-1",
        { status: "SENT", whatsappMessageId: null },
        "company1",
      );
    });
  });

  describe("failure callback", () => {
    it("marks the message FAILED and emits 'failed' using the threaded conversationId", async () => {
      mockMessageRepo.update.mockResolvedValue({});

      await processor(
        makeJob({
          success: false,
          companyId: "company1",
          dbMessageId: "db-msg-1",
          conversationId: "conv-threaded",
          error: "recipient is not on whatsapp",
        }),
      );

      expect(mockMessageRepo.update).toHaveBeenCalledWith("db-msg-1", { status: "FAILED" }, "company1");
      expect(socketEmitter.emitMessageStatus).toHaveBeenCalledWith(
        "db-msg-1",
        "conv-threaded",
        "company1",
        "failed",
      );
    });

    it("does not emit anything when the failure job has no conversationId (no DB row to fall back to on this path)", async () => {
      mockMessageRepo.update.mockResolvedValue({});

      await processor(
        makeJob({ success: false, companyId: "company1", dbMessageId: "db-msg-1", error: "boom" }),
      );

      expect(socketEmitter.emitMessageStatus).not.toHaveBeenCalled();
    });

    it("still marks FAILED even if the DB update itself throws (best-effort, swallowed)", async () => {
      mockMessageRepo.update.mockRejectedValue(new Error("row locked"));

      await expect(
        processor(
          makeJob({
            success: false,
            companyId: "company1",
            dbMessageId: "db-msg-1",
            conversationId: "conv1",
            error: "boom",
          }),
        ),
      ).resolves.toBeUndefined();

      expect(socketEmitter.emitMessageStatus).toHaveBeenCalledWith(
        "db-msg-1",
        "conv1",
        "company1",
        "failed",
      );
    });
  });

  it("propagates an error thrown while processing a SUCCESS callback (so BullMQ retries it)", async () => {
    mockMessageRepo.update.mockRejectedValue(new Error("DB unavailable"));

    await expect(
      processor(
        makeJob({
          success: true,
          companyId: "company1",
          dbMessageId: "db-msg-1",
          conversationId: "conv1",
        }),
      ),
    ).rejects.toThrow("DB unavailable");
  });
});
