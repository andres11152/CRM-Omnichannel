import { proto } from "@whiskeysockets/baileys";
import { Job } from "bullmq";

const capturedProcessors: Array<(job: Job) => Promise<void>> = [];
const capturedWorkerOptions: Array<Record<string, unknown>> = [];

const FAKE_IOREDIS_CONNECTION = { __brand: "real-ioredis-connection" };

jest.mock("bullmq", () => ({
  Worker: jest.fn().mockImplementation(
    (_name: string, processor: (job: Job) => Promise<void>, options: Record<string, unknown>) => {
      capturedProcessors.push(processor);
      capturedWorkerOptions.push(options);
      return { on: jest.fn(), close: jest.fn() };
    },
  ),
}));

jest.mock("@/config/bullmq", () => ({
  connection: FAKE_IOREDIS_CONNECTION,
}));

jest.mock("@/services/ChatSyncService", () => ({
  chatSyncService: {
    handleHistorySync: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock("@whiskeysockets/baileys", () => ({
  proto: {
    HistorySync: {
      HistorySyncType: {
        INITIAL_BOOTSTRAP: 0,
        INITIAL_STATUS_V3: 1,
        FULL: 2,
        RECENT: 3,
        PUSH_NAME: 4,
        NON_BLOCKING_DATA: 5,
        ON_DEMAND: 6,
      },
    },
  },
}));

import { HistorySyncWorker } from "@/services/queue/historySyncWorker";
import { chatSyncService } from "@/services/ChatSyncService";

const mockChatSyncService = chatSyncService as unknown as { handleHistorySync: jest.Mock };

function makeJob(data: Record<string, unknown>): Job {
  return { id: "job1", data } as unknown as Job;
}

describe("HistorySyncWorker", () => {
  let processor: (job: Job) => Promise<void>;

  beforeAll(() => {
    new HistorySyncWorker();
    processor = capturedProcessors[capturedProcessors.length - 1];
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("uses the shared ioredis connection from @/config/bullmq — not a redis-package client or bespoke options object", () => {
    const options = capturedWorkerOptions[capturedWorkerOptions.length - 1];
    expect(options.connection).toBe(FAKE_IOREDIS_CONNECTION);
  });

  it("classifies syncType 6 (the real ON_DEMAND enum value) as an on-demand sync", async () => {
    await processor(
      makeJob({
        companyId: "company1",
        messages: [{ key: { id: "m1" } }],
        chats: [],
        contacts: [],
        syncType: proto.HistorySync.HistorySyncType.ON_DEMAND,
      }),
    );

    expect(proto.HistorySync.HistorySyncType.ON_DEMAND).toBe(6);
    expect(mockChatSyncService.handleHistorySync).toHaveBeenCalledWith(
      "company1",
      [{ key: { id: "m1" } }],
      [],
      [],
      { onDemand: true },
      [],
    );
  });

  it("skips non-onDemand sync types (e.g. FULL=2, RECENT=3) to prevent DB bloat", async () => {
    await processor(
      makeJob({
        companyId: "company1",
        messages: [{ key: { id: "m1" } }],
        chats: [],
        contacts: [],
        syncType: proto.HistorySync.HistorySyncType.FULL,
      }),
    );

    expect(mockChatSyncService.handleHistorySync).not.toHaveBeenCalled();

    await processor(makeJob({ companyId: "company1", syncType: proto.HistorySync.HistorySyncType.RECENT }));

    expect(mockChatSyncService.handleHistorySync).not.toHaveBeenCalled();
  });

  it("propagates an error from handleHistorySync on on-demand sync so BullMQ retries the job", async () => {
    mockChatSyncService.handleHistorySync.mockRejectedValue(new Error("DB unavailable"));

    await expect(
      processor(
        makeJob({
          companyId: "company1",
          messages: [{ key: { id: "m1" } }],
          syncType: proto.HistorySync.HistorySyncType.ON_DEMAND,
        }),
      ),
    ).rejects.toThrow("DB unavailable");
  });
});
