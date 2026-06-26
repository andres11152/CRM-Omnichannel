/// <reference types="jest" />
import { webhookService } from "../src/services/WebhookService";
import { webhookRepository } from "../src/repositories/WebhookRepository";
import { webhookDispatcher } from "../src/services/WebhookDispatcher";
import { AppError } from "../src/utils/AppError";

// ── Mocks ────────────────────────────────────────────────────────────────────

jest.mock("../src/repositories/WebhookRepository", () => {
  const mockInstance = {
    findManyByCompanyId: jest.fn(),
    create: jest.fn(),
    deleteMany: jest.fn(),
    findFirstActive: jest.fn(),
    updateActiveStatus: jest.fn(),
    findDeliveryLogs: jest.fn(),
    findDeliveryLogById: jest.fn(),
  };
  return { webhookRepository: mockInstance };
});

jest.mock("../src/services/WebhookDispatcher", () => ({
  webhookDispatcher: {
    dispatch: jest.fn(),
    getLogs: jest.fn(),
    replayLog: jest.fn(),
    getSigningSecret: jest.fn(),
  },
}));

jest.mock("../src/services/MessageProcessorService", () => ({
  messageProcessor: { process: jest.fn() },
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

const repo = webhookRepository as unknown as Record<string, jest.Mock>;
const dispatcher = webhookDispatcher as unknown as Record<string, jest.Mock>;

const companyId = "company_abc";

const buildWebhook = (overrides: Record<string, unknown> = {}) => ({
  id: "wh_1",
  companyId,
  url: "https://example.com/hook",
  description: "Test hook",
  secretKey: "secret_abc",
  events: ["message.received"],
  isActive: true,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  ...overrides,
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("WebhookService", () => {
  beforeEach(() => jest.clearAllMocks());

  // ── listWebhooks ──────────────────────────────────────────────────────────

  describe("listWebhooks", () => {
    it("delegates to repository and returns the result", async () => {
      repo.findManyByCompanyId.mockResolvedValue([buildWebhook()]);
      const result = await webhookService.listWebhooks(companyId);
      expect(repo.findManyByCompanyId).toHaveBeenCalledWith(companyId);
      expect(result).toHaveLength(1);
      expect(result[0].url).toBe("https://example.com/hook");
    });
  });

  // ── createWebhook ─────────────────────────────────────────────────────────

  describe("createWebhook", () => {
    it("auto-generates a secret when none is provided", async () => {
      repo.create.mockResolvedValue(buildWebhook());
      await webhookService.createWebhook(companyId, {
        url: "https://example.com/hook",
        events: ["message.received"],
      });
      const call = repo.create.mock.calls[0];
      // 4th arg is the secret — should be a 64-char hex string
      expect(call[3]).toMatch(/^[a-f0-9]{64}$/);
    });

    it("uses the provided secret when one is given", async () => {
      repo.create.mockResolvedValue(buildWebhook());
      await webhookService.createWebhook(companyId, {
        url: "https://example.com/hook",
        events: ["message.received"],
        secretKey: "my_custom_secret",
      });
      const call = repo.create.mock.calls[0];
      expect(call[3]).toBe("my_custom_secret");
    });

    it("passes description through to the repository", async () => {
      repo.create.mockResolvedValue(buildWebhook());
      await webhookService.createWebhook(companyId, {
        url: "https://example.com/hook",
        events: ["contact.created"],
        description: "ERP integration",
      });
      const call = repo.create.mock.calls[0];
      // 5th arg is description
      expect(call[4]).toBe("ERP integration");
    });
  });

  // ── deleteWebhook ─────────────────────────────────────────────────────────

  describe("deleteWebhook", () => {
    it("throws 404 when no row is deleted (wrong id or companyId)", async () => {
      repo.deleteMany.mockResolvedValue({ count: 0 });
      await expect(
        webhookService.deleteWebhook("nonexistent_id", companyId),
      ).rejects.toThrow(new AppError("Webhook not found", 404));
    });

    it("resolves silently when the row is deleted", async () => {
      repo.deleteMany.mockResolvedValue({ count: 1 });
      await expect(
        webhookService.deleteWebhook("wh_1", companyId),
      ).resolves.toBeUndefined();
    });
  });

  // ── toggleWebhook ─────────────────────────────────────────────────────────

  describe("toggleWebhook", () => {
    it("throws 404 when the webhook does not belong to the company", async () => {
      repo.findFirstActive.mockResolvedValue(null);
      await expect(
        webhookService.toggleWebhook("wh_1", companyId),
      ).rejects.toThrow(new AppError("Webhook not found", 404));
    });

    it("flips isActive from true to false", async () => {
      repo.findFirstActive.mockResolvedValue(buildWebhook({ isActive: true }));
      repo.updateActiveStatus.mockResolvedValue(buildWebhook({ isActive: false }));

      const result = await webhookService.toggleWebhook("wh_1", companyId);

      expect(repo.updateActiveStatus).toHaveBeenCalledWith("wh_1", false);
      expect(result.isActive).toBe(false);
    });

    it("flips isActive from false to true", async () => {
      repo.findFirstActive.mockResolvedValue(buildWebhook({ isActive: false }));
      repo.updateActiveStatus.mockResolvedValue(buildWebhook({ isActive: true }));

      const result = await webhookService.toggleWebhook("wh_1", companyId);

      expect(repo.updateActiveStatus).toHaveBeenCalledWith("wh_1", true);
      expect(result.isActive).toBe(true);
    });
  });

  // ── verifyMetaChallenge ───────────────────────────────────────────────────

  describe("verifyMetaChallenge", () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv, META_VERIFY_TOKEN: "valid_token" };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it("returns the challenge on successful verification", () => {
      const result = webhookService.verifyMetaChallenge({
        "hub.mode": "subscribe",
        "hub.verify_token": "valid_token",
        "hub.challenge": "abc123",
      });
      expect(result).toBe("abc123");
    });

    it("throws 403 when the token is invalid", () => {
      expect(() =>
        webhookService.verifyMetaChallenge({
          "hub.mode": "subscribe",
          "hub.verify_token": "wrong_token",
          "hub.challenge": "abc123",
        }),
      ).toThrow(new AppError("Forbidden: Invalid Verify Token", 403));
    });

    it("throws 400 when required parameters are missing", () => {
      expect(() =>
        webhookService.verifyMetaChallenge({}),
      ).toThrow(new AppError("Bad Request: Missing parameters", 400));
    });
  });

  // ── getLogs / replayLog / getSigningSecret ────────────────────────────────

  describe("getLogs", () => {
    it("delegates to webhookDispatcher.getLogs", async () => {
      dispatcher.getLogs.mockResolvedValue([]);
      await webhookService.getLogs(companyId);
      expect(dispatcher.getLogs).toHaveBeenCalledWith(companyId);
    });
  });

  describe("replayLog", () => {
    it("delegates to webhookDispatcher.replayLog and returns result", async () => {
      dispatcher.replayLog.mockResolvedValue({
        status: "Rescheduled for manual retry",
        logId: "log_1",
      });
      const result = await webhookService.replayLog(companyId, "log_1");
      expect(dispatcher.replayLog).toHaveBeenCalledWith(companyId, "log_1");
      expect(result).toMatchObject({ logId: "log_1" });
    });
  });

  describe("getSigningSecret", () => {
    it("delegates to webhookDispatcher.getSigningSecret", () => {
      dispatcher.getSigningSecret.mockReturnValue("guidance string");
      const result = webhookService.getSigningSecret(companyId);
      expect(dispatcher.getSigningSecret).toHaveBeenCalledWith(companyId);
      expect(result).toBe("guidance string");
    });
  });
});
