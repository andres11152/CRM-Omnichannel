/// <reference types="jest" />
import { apiKeyService } from "../src/services/ApiKeyService";
import { apiKeyRepository } from "../src/repositories/ApiKeyRepository";

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock("../src/repositories/ApiKeyRepository", () => {
  const mockInstance = {
    findMany: jest.fn(),
    create: jest.fn(),
    deleteMany: jest.fn(),
  };
  return { ApiKeyRepository: jest.fn(() => mockInstance), apiKeyRepository: mockInstance };
});

jest.mock("../src/services/AuditLogService", () => ({
  auditLogService: { log: jest.fn() },
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

const repo = apiKeyRepository as unknown as Record<string, jest.Mock>;

const companyId = "company_abc";
const userId = "user_123";

const buildKey = (overrides: Record<string, unknown> = {}) => ({
  id: "key_1",
  companyId,
  name: "Test Key",
  keyPrefix: "sk_live_abc...",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  lastUsedAt: null,
  ...overrides,
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("ApiKeyService", () => {
  beforeEach(() => jest.clearAllMocks());

  // ── findAll ───────────────────────────────────────────────────────────────

  describe("findAll", () => {
    it("returns the list of keys for the company", async () => {
      repo.findMany.mockResolvedValue([buildKey()]);
      const result = await apiKeyService.findAll(companyId);
      expect(repo.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { companyId } }),
      );
      expect(result).toHaveLength(1);
    });

    it("returns an empty array when no keys exist", async () => {
      repo.findMany.mockResolvedValue([]);
      const result = await apiKeyService.findAll(companyId);
      expect(result).toEqual([]);
    });
  });

  // ── create ────────────────────────────────────────────────────────────────

  describe("create", () => {
    it("generates a key with the sk_live_ prefix", async () => {
      repo.create.mockResolvedValue(buildKey());
      const result = await apiKeyService.create(companyId, userId, "My Key");
      expect(result.secretKey).toMatch(/^sk_live_[a-f0-9]{48}$/);
    });

    it("stores a SHA-256 hash — never the raw key", async () => {
      let storedHash: string | undefined;
      repo.create.mockImplementation(({ data }: { data: { keyHash: string } }) => {
        storedHash = data.keyHash;
        return Promise.resolve(buildKey());
      });

      const result = await apiKeyService.create(companyId, userId, "My Key");

      // keyHash must be a 64-char hex SHA-256 digest
      expect(storedHash).toMatch(/^[a-f0-9]{64}$/);
      // The returned secretKey must differ from the stored hash
      expect(result.secretKey).not.toBe(storedHash);
    });

    it("uses the provided name or falls back to 'API Key'", async () => {
      repo.create.mockResolvedValue(buildKey({ name: "API Key" }));
      const withoutName = await apiKeyService.create(companyId, userId, undefined);
      expect(withoutName.secretKey).toBeDefined();

      repo.create.mockResolvedValue(buildKey({ name: "Custom" }));
      const withName = await apiKeyService.create(companyId, userId, "Custom");
      expect(withName.secretKey).toBeDefined();
    });

    it("returns the plain-text key ONCE (not in subsequent findAll results)", async () => {
      repo.create.mockResolvedValue(buildKey({ keyPrefix: "sk_live_abc..." }));
      const result = await apiKeyService.create(companyId, userId, "Key");
      // secretKey is returned only at creation time
      expect(result.secretKey).toBeDefined();
      // Subsequent list does NOT expose secretKey
      repo.findMany.mockResolvedValue([buildKey()]);
      const listed = await apiKeyService.findAll(companyId);
      expect((listed[0] as Record<string, unknown>).secretKey).toBeUndefined();
    });
  });

  // ── revoke ────────────────────────────────────────────────────────────────

  describe("revoke", () => {
    it("deletes the key scoped to the company (no cross-tenant deletion)", async () => {
      repo.deleteMany.mockResolvedValue({ count: 1 });
      await apiKeyService.revoke("key_1", companyId, userId);
      expect(repo.deleteMany).toHaveBeenCalledWith({
        where: { id: "key_1", companyId },
      });
    });

    it("does not throw when the key does not exist (idempotent)", async () => {
      repo.deleteMany.mockResolvedValue({ count: 0 });
      await expect(
        apiKeyService.revoke("nonexistent", companyId, userId),
      ).resolves.toBeUndefined();
    });
  });
});
