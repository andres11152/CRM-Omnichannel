// No REDIS_URL/DATABASE_URL is set in the test environment, so:
//  - src/config/redis.ts's module-level `redisClient` stays `null` (it only
//    calls `createClient()` when REDIS_URL is set, and never connects at
//    import time regardless — connection is explicit via connectRedis()).
//  - SessionLockService therefore takes its "no Redis configured" fallback
//    paths (acquire() -> true, getOwner() -> its own instanceId), which is
//    exactly the single-instance-dev behavior we want to exercise here.
// This lets us construct a REAL SessionManager (not a mock) and only mock the
// two things that actually touch a real datastore: Prisma and the session
// repository. AntiBanManager/WhatsAppSocketFactory/bindSessionEvents are only
// exercised by initializeSession()/terminateSession(), which this file does
// not test (they require a live Baileys socket — out of scope for a unit test).

// The real @whiskeysockets/baileys package ships ESM source
// (`import ... from './Socket/index.js'`) that ts-jest's CommonJS transform
// never touches (node_modules is untransformed by default), so simply
// importing anything from SessionManager's dependency chain crashes Jest
// with "Cannot use import statement outside a module". None of the methods
// under test in this file ever call into a real Baileys socket, so a stub
// module (just enough shape for the import bindings used across
// SessionManager/SimpleStore/SessionContactResolver/WhatsAppSocketFactory/
// SessionEventBinder to resolve) is sufficient and avoids loading it at all.
jest.mock("@whiskeysockets/baileys", () => ({
  __esModule: true,
  default: jest.fn(),
  jidNormalizedUser: (jid: string) => jid,
  isJidBroadcast: () => false,
  fetchLatestBaileysVersion: jest.fn().mockResolvedValue({ version: [2, 3000, 0] }),
  DisconnectReason: { loggedOut: 401 },
  proto: {},
}));

// WhatsAppSocketFactory/AntiBanManager/SessionEventBinder are only exercised
// by initializeSession()'s full socket-lifecycle (out of scope here, see file
// header) but SessionManager imports them eagerly at module load time, and
// they transitively pull in real ESM-only packages (https-proxy-agent,
// socks-proxy-agent) that Jest's CommonJS transform can't parse either.
// Stubbing these three modules directly is simpler and more targeted than
// chasing every transitive ESM dependency with its own mock.
jest.mock("../src/whatsapp/WhatsAppSocketFactory", () => ({
  WhatsAppSocketFactory: { create: jest.fn() },
}));
jest.mock("../src/whatsapp/AntiBanManager", () => ({
  antiBanManager: { wrapSocket: jest.fn((sock) => sock) },
}));
jest.mock("../src/whatsapp/events/SessionEventBinder", () => ({
  bindSessionEvents: jest.fn(),
}));

jest.mock("../src/config/database", () => ({
  prisma: {
    whatsAppSession: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
    },
  },
}));

jest.mock("../src/repositories/WhatsAppSessionRepository", () => ({
  whatsAppSessionRepository: {
    findByCompany: jest.fn(),
  },
}));

import { SessionManager } from "../src/whatsapp/SessionManager";
import { IAuthProvider } from "../src/whatsapp/interfaces";
import { prisma } from "../src/config/database";
import { whatsAppSessionRepository } from "../src/repositories/WhatsAppSessionRepository";
import { WASocket } from "@whiskeysockets/baileys";

const mockPrisma = prisma as unknown as {
  whatsAppSession: { findUnique: jest.Mock; findFirst: jest.Mock };
};
const mockRepo = whatsAppSessionRepository as unknown as { findByCompany: jest.Mock };

const fakeAuthProvider: IAuthProvider = {
  loadState: jest.fn(),
  clearCredentials: jest.fn(),
} as unknown as IAuthProvider;

// Reach into SessionManager's private in-memory maps the same way the class
// itself is populated by initializeSession() — this is the standard technique
// for unit-testing a class's query/derived-state methods without paying the
// cost of a real socket lifecycle.
function seedInMemorySession(
  manager: SessionManager,
  sessionId: string,
  companyId: string,
  status: "CONNECTING" | "CONNECTED" | "DISCONNECTED" | "QR_PENDING",
  sock?: Partial<WASocket>,
) {
  (manager as unknown as { sessions: Map<string, WASocket> }).sessions.set(
    sessionId,
    (sock ?? {}) as WASocket,
  );
  (
    manager as unknown as {
      sessionMetadata: Map<string, { companyId: string; status: string }>;
    }
  ).sessionMetadata.set(sessionId, { companyId, status });
}

describe("SessionManager", () => {
  let manager: SessionManager;

  beforeEach(() => {
    jest.clearAllMocks();
    manager = new SessionManager(fakeAuthProvider);
  });

  describe("getSessionStatus", () => {
    it("returns DISCONNECTED for a session with no in-memory metadata", () => {
      expect(manager.getSessionStatus("unknown-session")).toEqual({
        sessionId: "unknown-session",
        status: "DISCONNECTED",
      });
    });

    it("returns the live in-memory status for a known session", () => {
      seedInMemorySession(manager, "sess1", "company1", "CONNECTED");
      expect(manager.getSessionStatus("sess1")).toEqual({
        sessionId: "sess1",
        status: "CONNECTED",
      });
    });
  });

  describe("hasActiveSessionInMemory", () => {
    it("returns false when the company has no CONNECTED session", () => {
      seedInMemorySession(manager, "sess1", "company1", "CONNECTING");
      expect(manager.hasActiveSessionInMemory("company1")).toBe(false);
    });

    it("returns true when the company has a CONNECTED session", () => {
      seedInMemorySession(manager, "sess1", "company1", "CONNECTED");
      expect(manager.hasActiveSessionInMemory("company1")).toBe(true);
    });

    it("ignores CONNECTED sessions belonging to a different company", () => {
      seedInMemorySession(manager, "sess1", "company-other", "CONNECTED");
      expect(manager.hasActiveSessionInMemory("company1")).toBe(false);
    });
  });

  describe("findActiveSessionForCompany", () => {
    it("returns the in-memory socket immediately when one is CONNECTED (no DB round-trip)", async () => {
      const sock = { user: { id: "573001234567:1@s.whatsapp.net" } } as unknown as WASocket;
      seedInMemorySession(manager, "sess1", "company1", "CONNECTED", sock);

      const result = await manager.findActiveSessionForCompany("company1");

      expect(result).toEqual({ sessionId: "sess1", socket: sock });
      expect(mockPrisma.whatsAppSession.findFirst).not.toHaveBeenCalled();
    });

    it("returns null when no in-memory session is CONNECTED and no DB row matches either", async () => {
      mockPrisma.whatsAppSession.findFirst.mockResolvedValue(null);

      const result = await manager.findActiveSessionForCompany("company1");

      expect(result).toBeNull();
      expect(mockPrisma.whatsAppSession.findFirst).toHaveBeenCalledWith({
        where: { companyId: "company1", status: "CONNECTED", provider: "BAILEYS" },
      });
    });

    it("returns null (not a crash) for a 'zombie' DB row whose socket isn't in memory — triggers a background reconnect instead of handing back a dead socket", async () => {
      mockPrisma.whatsAppSession.findFirst.mockResolvedValue({
        sessionId: "zombie-session",
        companyId: "company1",
      });
      // No matching entry in manager's in-memory `sessions` map for "zombie-session".

      const result = await manager.findActiveSessionForCompany("company1");

      // This is the exact contract callers depend on: never return a session
      // descriptor whose socket doesn't actually exist in memory.
      expect(result).toBeNull();
    });
  });

  describe("listSessions", () => {
    it("merges DB rows (source of truth for existence) with in-memory status/phone (source of truth for liveness)", async () => {
      mockRepo.findByCompany.mockResolvedValue([
        {
          sessionId: "sess1",
          companyId: "company1",
          status: "DISCONNECTED", // stale DB status
          phone: "573000000000",
          qrCode: null,
          profileName: "Support Line",
          updatedAt: new Date("2024-01-01"),
          createdAt: new Date("2024-01-01"),
          defaultQueueId: null,
          proxyUrl: null,
        },
      ]);
      // In-memory says it's actually CONNECTED right now (fresher than DB).
      const sock = { user: { id: "573001234567:1@s.whatsapp.net" } } as unknown as WASocket;
      seedInMemorySession(manager, "sess1", "company1", "CONNECTED", sock);

      const result = await manager.listSessions("company1");

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        sessionId: "sess1",
        status: "CONNECTED", // in-memory wins over the stale DB status
        phone: "573001234567", // derived live from the socket's own user id
      });
    });

    it("falls back to the DB's own status/phone for a session this process hasn't initialized since boot", async () => {
      mockRepo.findByCompany.mockResolvedValue([
        {
          sessionId: "sess-not-in-memory",
          companyId: "company1",
          status: "CONNECTED",
          phone: "573001112233",
          qrCode: null,
          profileName: null,
          updatedAt: new Date(),
          createdAt: new Date(),
          defaultQueueId: null,
          proxyUrl: null,
        },
      ]);

      const result = await manager.listSessions("company1");

      expect(result[0]).toMatchObject({
        sessionId: "sess-not-in-memory",
        status: "CONNECTED",
        phone: "573001112233",
      });
    });

    it("returns an empty array for a company with no sessions", async () => {
      mockRepo.findByCompany.mockResolvedValue([]);
      expect(await manager.listSessions("company-none")).toEqual([]);
    });
  });

  describe("getSessionInfo", () => {
    it("returns in-memory info without touching the DB when metadata is already loaded", async () => {
      seedInMemorySession(manager, "sess1", "company1", "CONNECTED", {
        user: { id: "573001234567:1@s.whatsapp.net" },
      } as unknown as WASocket);

      const info = await manager.getSessionInfo("sess1");

      expect(info).toEqual({ companyId: "company1", status: "CONNECTED", phone: "573001234567" });
      expect(mockPrisma.whatsAppSession.findUnique).not.toHaveBeenCalled();
    });

    it("falls back to a DB lookup for a session not yet loaded into memory", async () => {
      mockPrisma.whatsAppSession.findUnique.mockResolvedValue({
        companyId: "company1",
        status: "DISCONNECTED",
        phone: "573009998877",
      });

      const info = await manager.getSessionInfo("sess-cold");

      expect(info).toEqual({
        companyId: "company1",
        status: "DISCONNECTED",
        phone: "573009998877",
      });
    });

    it("returns null when the session exists nowhere", async () => {
      mockPrisma.whatsAppSession.findUnique.mockResolvedValue(null);
      expect(await manager.getSessionInfo("does-not-exist")).toBeNull();
    });
  });

  describe("getAllMemorySessions", () => {
    it("reports the status of every session currently tracked in memory", () => {
      seedInMemorySession(manager, "sess1", "company1", "CONNECTED");
      seedInMemorySession(manager, "sess2", "company2", "CONNECTING");

      expect(manager.getAllMemorySessions()).toEqual({
        sess1: "CONNECTED",
        sess2: "CONNECTING",
      });
    });
  });
});
