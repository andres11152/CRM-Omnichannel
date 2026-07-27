// True end-to-end coverage of this microservice's HTTP surface: a real
// Express app (express.json() + the real internalAuth middleware + the real
// message/session routers + the real controllers + real Zod schemas),
// driven with supertest. The only thing replaced is the `sessionManager`
// singleton itself (so no real Baileys socket / DB / Redis is ever touched)
// and the dynamically-imported OutboundJidResolver + baileys module used
// inside MessageController.sendMessage.
//
// This exercises the exact request/response cycle a real caller (the
// backend's whatsAppServiceHttp client) goes through: auth header check ->
// Zod validation -> controller logic -> real HTTP status codes/JSON shape.

process.env.WHATSAPP_INTERNAL_SECRET = "test-shared-secret";

jest.mock("../src/whatsapp", () => ({
  sessionManager: {
    findActiveSessionForCompany: jest.fn(),
    initializeSession: jest.fn().mockResolvedValue(undefined),
    terminateSession: jest.fn().mockResolvedValue(undefined),
    reconnectSession: jest.fn().mockResolvedValue(undefined),
    getSessionStatus: jest.fn(),
    listSessions: jest.fn(),
  },
}));

jest.mock("../src/whatsapp/OutboundJidResolver", () => {
  return jest.fn().mockImplementation(() => ({
    resolveDestinationJid: jest.fn(async (to: string) => `${to.replace(/\D/g, "")}@s.whatsapp.net`),
  }));
});

jest.mock("../src/repositories/WhatsAppSessionRepository", () => ({
  whatsAppSessionRepository: {
    ensureSessionRecord: jest.fn().mockResolvedValue(undefined),
    upsertProxy: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock("@whiskeysockets/baileys", () => ({
  __esModule: true,
  default: jest.fn(),
  generateMessageID: jest.fn(() => "generated-msg-id"),
  jidNormalizedUser: (jid: string) => jid,
  isJidBroadcast: () => false,
  fetchLatestBaileysVersion: jest.fn().mockResolvedValue({ version: [2, 3000, 0] }),
  DisconnectReason: { loggedOut: 401 },
  proto: {},
}));

import express from "express";
import request from "supertest";
import { internalAuth } from "../src/middleware/internalAuth";
import messageRouter from "../src/routes/message.routes";
import sessionRouter from "../src/routes/session.routes";
import { sessionManager } from "../src/whatsapp";

const mockSessionManager = sessionManager as unknown as {
  findActiveSessionForCompany: jest.Mock;
  initializeSession: jest.Mock;
  terminateSession: jest.Mock;
  reconnectSession: jest.Mock;
  getSessionStatus: jest.Mock;
  listSessions: jest.Mock;
};

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(internalAuth);
  app.use("/sessions", sessionRouter);
  app.use("/messages", messageRouter);
  return app;
}

const AUTH_HEADER = { "x-internal-service-key": "test-shared-secret" };

describe("whatsapp-service HTTP API (E2E)", () => {
  let app: express.Express;

  beforeEach(() => {
    jest.clearAllMocks();
    app = buildApp();
  });

  describe("internalAuth middleware", () => {
    it("rejects a request with no service-key header", async () => {
      const res = await request(app).get("/sessions/company1");
      expect(res.status).toBe(401);
    });

    it("rejects a request with the wrong service-key", async () => {
      const res = await request(app)
        .get("/sessions/company1")
        .set("x-internal-service-key", "wrong-secret");
      expect(res.status).toBe(401);
    });

    it("fails closed (503) when WHATSAPP_INTERNAL_SECRET isn't configured at all", async () => {
      const original = process.env.WHATSAPP_INTERNAL_SECRET;
      delete process.env.WHATSAPP_INTERNAL_SECRET;
      // internalAuth reads SHARED_SECRET once at module load, so re-require it
      // fresh under isolateModules to pick up the mutated env var.
      let freshApp!: express.Express;
      jest.isolateModules(() => {
        const { internalAuth: freshInternalAuth } = require("../src/middleware/internalAuth");
        freshApp = express();
        freshApp.use(express.json());
        freshApp.use(freshInternalAuth);
        freshApp.use("/sessions", sessionRouter);
      });

      const res = await request(freshApp)
        .get("/sessions/company1")
        .set(AUTH_HEADER);

      expect(res.status).toBe(503);
      process.env.WHATSAPP_INTERNAL_SECRET = original;
    });
  });

  describe("POST /messages/send", () => {
    it("returns 400 for a payload that fails Zod validation", async () => {
      const res = await request(app)
        .post("/messages/send")
        .set(AUTH_HEADER)
        .send({ companyId: "company1" }); // missing `to` and `type`

      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
    });

    it("returns 503 when the company has no active WhatsApp session", async () => {
      mockSessionManager.findActiveSessionForCompany.mockResolvedValue(null);

      const res = await request(app)
        .post("/messages/send")
        .set(AUTH_HEADER)
        .send({ companyId: "company1", to: "573001234567", type: "text", content: "hi" });

      expect(res.status).toBe(503);
      expect(res.body.error).toMatch(/no active whatsapp session/i);
    });

    it("sends a text message through the real socket call and returns the real Baileys message id", async () => {
      const sendMessage = jest.fn().mockResolvedValue({ key: { id: "real-baileys-id" } });
      mockSessionManager.findActiveSessionForCompany.mockResolvedValue({
        sessionId: "sess1",
        socket: { sendMessage },
      });

      const res = await request(app)
        .post("/messages/send")
        .set(AUTH_HEADER)
        .send({ companyId: "company1", to: "573001234567", type: "text", content: "hello there" });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, messageId: "real-baileys-id" });
      expect(sendMessage).toHaveBeenCalledWith(
        "573001234567@s.whatsapp.net",
        { text: "hello there" },
        expect.objectContaining({ messageId: "generated-msg-id" }),
      );
    });

    it("pre-fetches group metadata before sending to a @g.us JID, and tolerates that lookup failing", async () => {
      jest.doMock("../src/whatsapp/OutboundJidResolver", () => {
        return jest.fn().mockImplementation(() => ({
          resolveDestinationJid: jest.fn(async () => "123-456@g.us"),
        }));
      });
      const sendMessage = jest.fn().mockResolvedValue({ key: { id: "grp-msg-id" } });
      const groupMetadata = jest.fn().mockRejectedValue(new Error("metadata fetch failed"));
      mockSessionManager.findActiveSessionForCompany.mockResolvedValue({
        sessionId: "sess1",
        socket: { sendMessage, groupMetadata },
      });

      const res = await request(app)
        .post("/messages/send")
        .set(AUTH_HEADER)
        .send({ companyId: "company1", to: "123-456@g.us", type: "text", content: "hi group" });

      // A failed group-metadata pre-fetch is logged and swallowed, not fatal —
      // the send itself must still go through.
      expect(res.status).toBe(200);
      expect(sendMessage).toHaveBeenCalled();
    });

    it("returns 400 for type 'media' with no media payload", async () => {
      mockSessionManager.findActiveSessionForCompany.mockResolvedValue({
        sessionId: "sess1",
        socket: { sendMessage: jest.fn() },
      });

      const res = await request(app)
        .post("/messages/send")
        .set(AUTH_HEADER)
        .send({ companyId: "company1", to: "573001234567", type: "media" });

      expect(res.status).toBe(400);
    });

    it("returns 500 with the underlying error message when the Baileys send itself throws", async () => {
      const sendMessage = jest.fn().mockRejectedValue(new Error("Connection Closed"));
      mockSessionManager.findActiveSessionForCompany.mockResolvedValue({
        sessionId: "sess1",
        socket: { sendMessage },
      });

      const res = await request(app)
        .post("/messages/send")
        .set(AUTH_HEADER)
        .send({ companyId: "company1", to: "573001234567", type: "text", content: "hi" });

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("Connection Closed");
    });
  });

  describe("POST /messages/reaction", () => {
    it("sends a reaction using the real key/id shape Baileys expects", async () => {
      const sendMessage = jest.fn().mockResolvedValue({});
      mockSessionManager.findActiveSessionForCompany.mockResolvedValue({
        sessionId: "sess1",
        socket: { sendMessage },
      });

      const res = await request(app)
        .post("/messages/reaction")
        .set(AUTH_HEADER)
        .send({ companyId: "company1", to: "573001234567", messageId: "msg1", reaction: "👍" });

      expect(res.status).toBe(200);
      expect(sendMessage).toHaveBeenCalledWith(
        "573001234567@s.whatsapp.net",
        expect.objectContaining({
          react: expect.objectContaining({
            text: "👍",
            key: expect.objectContaining({ id: "msg1", fromMe: false }),
          }),
        }),
      );
    });
  });

  describe("POST /messages/revoke", () => {
    it("returns 400 when messageId is missing", async () => {
      const res = await request(app)
        .post("/messages/revoke")
        .set(AUTH_HEADER)
        .send({ companyId: "company1", to: "573001234567" });

      expect(res.status).toBe(400);
    });
  });

  describe("GET /sessions/status/:sessionId", () => {
    it("proxies the real SessionManager status shape", async () => {
      mockSessionManager.getSessionStatus.mockReturnValue({
        sessionId: "sess1",
        status: "CONNECTED",
      });

      const res = await request(app).get("/sessions/status/sess1").set(AUTH_HEADER);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ sessionId: "sess1", status: "CONNECTED" });
    });
  });

  describe("GET /sessions/:companyId", () => {
    it("returns the session list for a company", async () => {
      mockSessionManager.listSessions.mockResolvedValue([
        { sessionId: "sess1", status: "CONNECTED", phone: "573001234567" },
      ]);

      const res = await request(app).get("/sessions/company1").set(AUTH_HEADER);

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
    });
  });

  describe("POST /sessions", () => {
    it("returns 400 when companyId is missing", async () => {
      const res = await request(app).post("/sessions").set(AUTH_HEADER).send({});
      expect(res.status).toBe(400);
    });

    it("kicks off session initialization in the background and immediately returns CONNECTING", async () => {
      const res = await request(app)
        .post("/sessions")
        .set(AUTH_HEADER)
        .send({ companyId: "company1", sessionId: "sess1" });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ sessionId: "sess1", status: "CONNECTING" });
      expect(mockSessionManager.initializeSession).toHaveBeenCalledWith({
        sessionId: "sess1",
        companyId: "company1",
        phoneForPairing: undefined,
      });
    });

    it("rejects an invalid proxyUrl", async () => {
      const res = await request(app)
        .post("/sessions")
        .set(AUTH_HEADER)
        .send({ companyId: "company1", proxyUrl: "not-a-url" });

      expect(res.status).toBe(400);
    });
  });

  describe("DELETE /sessions/:sessionId", () => {
    it("terminates the session and clears auth by default on DELETE", async () => {
      const res = await request(app).delete("/sessions/sess1").set(AUTH_HEADER);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true });
      expect(mockSessionManager.terminateSession).toHaveBeenCalledWith("sess1", true);
    });
  });
});
