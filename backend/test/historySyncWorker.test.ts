// Regression test for a critical bug in the on-demand WhatsApp history sync
// pipeline: HistorySyncWorker previously passed `redisClient` (built from the
// `redis` npm package, via "@/config/redis") as BullMQ's `connection` option.
// That client duck-types past BullMQ's connection check (it has
// connect/disconnect/duplicate, same names ioredis uses) so construction
// never threw — but BullMQ's actual job-processing loop needs ioredis-only
// APIs (`defineCommand` for its Lua scripts, the `.status` state machine),
// so the worker silently never consumed a single job. Confirmed empirically
// against a real local Redis: a job enqueued via a real ioredis-backed Queue
// stayed in "waiting" forever with a `redis`-client-backed Worker, with zero
// error/failed events ever firing — exactly why "on-demand sync doesn't
// work" produced no errors anywhere. Fixed by reusing the shared ioredis
// `connection` from "@/config/bullmq", same as the (working) messageQueueWorker.
//
// This test's most important assertion is the simplest one: the `connection`
// object handed to `new Worker(...)` must be the real ioredis-backed
// singleton, not a redis-package client or an ad-hoc options object.

const capturedProcessors: Array<(job: unknown) => Promise<void>> = [];
const capturedWorkerOptions: Array<Record<string, unknown>> = [];

const FAKE_IOREDIS_CONNECTION = { __brand: "real-ioredis-connection" };

jest.mock("bullmq", () => ({
  Worker: jest.fn().mockImplementation(
    (_name: string, processor: (job: unknown) => Promise<void>, options: Record<string, unknown>) => {
      capturedProcessors.push(processor);
      capturedWorkerOptions.push(options);
      return { on: jest.fn(), close: jest.fn() };
    },
  ),
}));

jest.mock("@/config/bullmq", () => ({
  connection: FAKE_IOREDIS_CONNECTION,
}));

jest.mock("../src/services/ChatSyncService", () => ({
  chatSyncService: {
    handleHistorySync: jest.fn().mockResolvedValue(undefined),
  },
}));

// The real @whiskeysockets/baileys ships ESM source Jest's CommonJS transform
// can't parse (node_modules is untransformed by default) — none of this
// worker's logic under test calls into a real socket, only the
// HistorySyncType enum values, which are stable, documented protocol
// constants (see WAProto/index.d.ts): INITIAL_BOOTSTRAP=0, INITIAL_STATUS_V3=1,
// FULL=2, RECENT=3, PUSH_NAME=4, NON_BLOCKING_DATA=5, ON_DEMAND=6.
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

import { HistorySyncWorker } from "../src/services/queue/historySyncWorker";
import { chatSyncService } from "../src/services/ChatSyncService";
import { proto } from "@whiskeysockets/baileys";

const mockChatSyncService = chatSyncService as unknown as { handleHistorySync: jest.Mock };

function makeJob(data: Record<string, unknown>) {
  return { id: "job1", data };
}

describe("HistorySyncWorker", () => {
  let processor: (job: unknown) => Promise<void>;

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
    );
  });

  it("does NOT classify syncType 2 (FULL) as on-demand — regression guard for the previous `=== 2` misclassification bug", async () => {
    await processor(
      makeJob({
        companyId: "company1",
        messages: [{ key: { id: "m1" } }],
        chats: [],
        contacts: [],
        syncType: proto.HistorySync.HistorySyncType.FULL,
      }),
    );

    expect(mockChatSyncService.handleHistorySync).toHaveBeenCalledWith(
      "company1",
      [{ key: { id: "m1" } }],
      [],
      [],
      { onDemand: false },
    );
  });

  it("defaults missing messages/chats/contacts to empty arrays rather than passing undefined", async () => {
    await processor(makeJob({ companyId: "company1", syncType: proto.HistorySync.HistorySyncType.RECENT }));

    expect(mockChatSyncService.handleHistorySync).toHaveBeenCalledWith(
      "company1",
      [],
      [],
      [],
      { onDemand: false },
    );
  });

  it("propagates an error from handleHistorySync so BullMQ retries the job", async () => {
    mockChatSyncService.handleHistorySync.mockRejectedValue(new Error("DB unavailable"));

    await expect(
      processor(makeJob({ companyId: "company1", messages: [{ key: { id: "m1" } }] })),
    ).rejects.toThrow("DB unavailable");
  });
});
