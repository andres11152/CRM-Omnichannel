/// <reference types="jest" />
import axios from "axios";
import { webhookDispatcher } from "../src/services/WebhookDispatcher";
import { webhookRepository } from "../src/repositories/WebhookRepository";

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock("axios");
jest.mock("../src/repositories/WebhookRepository", () => {
  const mockInstance = {
    findActiveByEvent: jest.fn(),
    findDeliveryLogById: jest.fn(),
    findDeliveryLogs: jest.fn(),
    createDeliveryLog: jest.fn(),
  };
  return { webhookRepository: mockInstance };
});

// ── Helpers ───────────────────────────────────────────────────────────────────

const repo = webhookRepository as unknown as Record<string, jest.Mock>;
const axiosMock = axios as jest.Mocked<typeof axios>;

const companyId = "company_abc";

const buildWebhook = (overrides: Record<string, unknown> = {}) => ({
  id: "wh_1",
  companyId,
  url: "https://example.com/hook",
  secretKey: "secret_key",
  events: ["message.received"],
  isActive: true,
  ...overrides,
});

const buildEventPayload = () => ({
  id: "evt_test_1234",
  object: "event" as const,
  apiVersion: "2025-04-01",
  created: 1_700_000_000,
  type: "message.received",
  data: { object: { from: "123", text: "hi" } },
});

const buildLog = (overrides: Record<string, unknown> = {}) => ({
  id: "log_1",
  companyId,
  webhookId: "wh_1",
  url: "https://example.com/hook",
  eventType: "message.received",
  payload: buildEventPayload(),
  webhook: buildWebhook(),
  ...overrides,
});

/** Suppress delays so retry tests don't time out. */
const mockSetTimeoutImmediate = () =>
  jest.spyOn(global, "setTimeout").mockImplementation((fn: TimerHandler) => {
    if (typeof fn === "function") (fn as () => void)();
    return 0 as unknown as ReturnType<typeof setTimeout>;
  });

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("WebhookDispatcher", () => {
  beforeEach(() => {
    // resetAllMocks also clears queued mockResolvedValueOnce entries
    jest.resetAllMocks();
    repo.createDeliveryLog.mockResolvedValue({});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ── dispatch ──────────────────────────────────────────────────────────────

  describe("dispatch", () => {
    it("returns early without touching axios when no webhooks are subscribed", async () => {
      repo.findActiveByEvent.mockResolvedValue([]);
      await webhookDispatcher.dispatch(companyId, "message.received", { from: "1" });
      expect(axiosMock.post).not.toHaveBeenCalled();
    });

    it("calls axios.post for each active subscribed webhook", async () => {
      repo.findActiveByEvent.mockResolvedValue([
        buildWebhook({ id: "wh_1", url: "https://a.com/hook" }),
        buildWebhook({ id: "wh_2", url: "https://b.com/hook" }),
      ]);
      axiosMock.post.mockResolvedValue({ status: 200 });

      await webhookDispatcher.dispatch(companyId, "message.received", { from: "1" });
      // Let the fire-and-forget promises settle
      await new Promise((r) => setImmediate(r));

      expect(axiosMock.post).toHaveBeenCalledTimes(2);
      expect(axiosMock.post).toHaveBeenCalledWith(
        "https://a.com/hook",
        expect.objectContaining({ type: "message.received" }),
        expect.any(Object),
      );
    });

    it("persists a delivery log with the full payload for each attempt", async () => {
      repo.findActiveByEvent.mockResolvedValue([buildWebhook()]);
      axiosMock.post.mockResolvedValue({ status: 200 });

      await webhookDispatcher.dispatch(companyId, "message.received", { from: "1" });
      await new Promise((r) => setImmediate(r));

      expect(repo.createDeliveryLog).toHaveBeenCalledWith(
        expect.objectContaining({
          companyId,
          webhookId: "wh_1",
          eventType: "message.received",
          status: 200,
          payload: expect.objectContaining({ type: "message.received" }),
        }),
      );
    });
  });

  // ── deliverWithRetry ──────────────────────────────────────────────────────

  describe("deliverWithRetry", () => {
    it("succeeds on the first attempt and does not retry", async () => {
      axiosMock.post.mockResolvedValue({ status: 200 });

      const result = await webhookDispatcher.deliverWithRetry(
        companyId,
        "wh_1",
        "https://example.com/hook",
        "secret",
        buildEventPayload(),
      );

      expect(result.status).toBe(200);
      expect(result.attempt).toBe(1);
      expect(axiosMock.post).toHaveBeenCalledTimes(1);
    });

    it("retries on 500 and succeeds on the second attempt", async () => {
      // Spy on deliverOnce so we can control per-attempt responses without real HTTP
      const deliverOnceSpy = jest
        .spyOn(webhookDispatcher, "deliverOnce")
        .mockResolvedValueOnce({ webhookId: "wh_1", url: "url", status: 500, duration: 10, attempt: 1 })
        .mockResolvedValueOnce({ webhookId: "wh_1", url: "url", status: 200, duration: 5, attempt: 2 });

      // Override setTimeout so the 5-second delay is instant
      mockSetTimeoutImmediate();

      const result = await webhookDispatcher.deliverWithRetry(
        companyId,
        "wh_1",
        "https://example.com/hook",
        null,
        buildEventPayload(),
      );

      expect(result.status).toBe(200);
      expect(result.attempt).toBe(2);
      expect(deliverOnceSpy).toHaveBeenCalledTimes(2);
    });

    it("does NOT retry on 400 (non-retryable client error)", async () => {
      axiosMock.post.mockResolvedValue({ status: 400 });

      const result = await webhookDispatcher.deliverWithRetry(
        companyId,
        "wh_1",
        "https://example.com/hook",
        null,
        buildEventPayload(),
      );

      expect(result.status).toBe(400);
      expect(axiosMock.post).toHaveBeenCalledTimes(1);
    });

    it("retries on 429 (rate-limited)", async () => {
      const deliverOnceSpy = jest
        .spyOn(webhookDispatcher, "deliverOnce")
        .mockResolvedValueOnce({ webhookId: "wh_1", url: "url", status: 429, duration: 10, attempt: 1 })
        .mockResolvedValueOnce({ webhookId: "wh_1", url: "url", status: 200, duration: 5, attempt: 2 });

      mockSetTimeoutImmediate();

      const result = await webhookDispatcher.deliverWithRetry(
        companyId,
        "wh_1",
        "https://example.com/hook",
        null,
        buildEventPayload(),
      );

      expect(result.status).toBe(200);
      expect(deliverOnceSpy).toHaveBeenCalledTimes(2);
    });

    it("exhausts all retries and returns the last failure", async () => {
      const deliverOnceSpy = jest
        .spyOn(webhookDispatcher, "deliverOnce")
        .mockResolvedValue({ webhookId: "wh_1", url: "url", status: 503, duration: 10, attempt: 1 });

      mockSetTimeoutImmediate();

      const result = await webhookDispatcher.deliverWithRetry(
        companyId,
        "wh_1",
        "https://example.com/hook",
        null,
        buildEventPayload(),
      );

      expect(result.status).toBe(503);
      expect(deliverOnceSpy).toHaveBeenCalledTimes(3); // MAX_RETRIES = 3
    });

    it("includes HMAC-SHA256 signature header when webhook has a secret", async () => {
      axiosMock.post.mockResolvedValue({ status: 200 });

      await webhookDispatcher.deliverWithRetry(
        companyId,
        "wh_1",
        "https://example.com/hook",
        "my_secret",
        buildEventPayload(),
      );

      const callArgs = axiosMock.post.mock.calls[0];
      const headers = (callArgs[2] as { headers: Record<string, string> }).headers;
      expect(headers["X-Sentry-Signature"]).toMatch(/^t=\d+,v1=[a-f0-9]{64}$/);
    });

    it("omits the signature header when webhook has no secret", async () => {
      axiosMock.post.mockResolvedValue({ status: 200 });

      await webhookDispatcher.deliverWithRetry(
        companyId,
        "wh_1",
        "https://example.com/hook",
        null,
        buildEventPayload(),
      );

      const callArgs = axiosMock.post.mock.calls[0];
      const headers = (callArgs[2] as { headers: Record<string, string> }).headers;
      expect(headers["X-Sentry-Signature"]).toBeUndefined();
    });
  });

  // ── replayLog ─────────────────────────────────────────────────────────────

  describe("replayLog", () => {
    it("throws when the log does not exist", async () => {
      repo.findDeliveryLogById.mockResolvedValue(null);
      await expect(
        webhookDispatcher.replayLog(companyId, "nonexistent"),
      ).rejects.toThrow("Log not found");
    });

    it("throws when the original webhook was deleted", async () => {
      repo.findDeliveryLogById.mockResolvedValue(buildLog({ webhook: null }));
      await expect(
        webhookDispatcher.replayLog(companyId, "log_1"),
      ).rejects.toThrow("Original webhook deleted");
    });

    it("throws when the log has no stored payload", async () => {
      repo.findDeliveryLogById.mockResolvedValue(buildLog({ payload: null }));
      await expect(
        webhookDispatcher.replayLog(companyId, "log_1"),
      ).rejects.toThrow("No payload recorded for this log");
    });

    it("returns a rescheduled confirmation without blocking", async () => {
      repo.findDeliveryLogById.mockResolvedValue(buildLog());
      axiosMock.post.mockResolvedValue({ status: 200 });

      const result = await webhookDispatcher.replayLog(companyId, "log_1");

      expect(result).toMatchObject({
        status: "Rescheduled for manual retry",
        logId: "log_1",
      });
    });
  });

  // ── getLogs ───────────────────────────────────────────────────────────────

  describe("getLogs", () => {
    it("returns logs from repository", async () => {
      const fakeLogs = [{ id: "log_1", eventType: "message.received" }];
      repo.findDeliveryLogs.mockResolvedValue(fakeLogs);

      const result = await webhookDispatcher.getLogs(companyId);

      expect(repo.findDeliveryLogs).toHaveBeenCalledWith(companyId, 20);
      expect(result).toEqual(fakeLogs);
    });

    it("returns [] when the repository throws (resilient)", async () => {
      repo.findDeliveryLogs.mockRejectedValue(new Error("DB error"));
      const result = await webhookDispatcher.getLogs(companyId);
      expect(result).toEqual([]);
    });
  });
});
