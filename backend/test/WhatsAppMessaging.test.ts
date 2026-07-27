// Regression tests for the outbound "messages don't actually go out" bug fix:
// sendMessage() used to be untestable-but-broken (backend's local
// sessionManager never has a real Baileys socket, since the socket now lives
// exclusively in whatsapp-service — see the [SEC] comment in the source), and
// both sendMessage() and executeQueuedMessage() previously reported a
// hardcoded "SENT" status / emitted the wrong socket event name before the
// message ever reached Baileys. These tests pin down the corrected behavior.

jest.mock("@/whatsapp/utils/whatsAppServiceHttp", () => ({
  whatsappServiceHttp: {
    get: jest.fn(),
    post: jest.fn(),
  },
}));

jest.mock("@/services/ChatService", () => ({
  chatService: {
    upsertMessage: jest.fn(),
  },
}));

jest.mock("@/services/queue/messageQueueService", () => ({
  messageQueueService: {
    enqueue: jest.fn(),
  },
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

jest.mock("@whiskeysockets/baileys", () => ({
  generateMessageID: jest.fn(() => "generated-msg-id"),
}));

jest.mock("@/utils/logger", () => ({
  Logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));

import { WhatsAppMessaging } from "../src/whatsapp/services/WhatsAppMessaging";
import { ISessionManager } from "../src/whatsapp/core/interfaces/ISessionManager";
import { IMessageHandler } from "../src/whatsapp/core/interfaces/IMessageHandler";
import { RateLimitService } from "../src/whatsapp/services/RateLimitService";
import { whatsappServiceHttp } from "../src/whatsapp/utils/whatsAppServiceHttp";
import { chatService } from "../src/services/ChatService";
import { messageQueueService } from "../src/services/queue/messageQueueService";
import { messageRepository } from "../src/repositories/MessageRepository";
import { SocketEventEmitter } from "../src/services/SocketEventEmitter";

const mockHttp = whatsappServiceHttp as unknown as { get: jest.Mock; post: jest.Mock };
const mockChatService = chatService as unknown as { upsertMessage: jest.Mock };
const mockQueueService = messageQueueService as unknown as { enqueue: jest.Mock };
const mockMessageRepo = messageRepository as unknown as { update: jest.Mock };
const MockSocketEventEmitter = SocketEventEmitter as unknown as jest.Mock;

describe("WhatsAppMessaging", () => {
  let messaging: WhatsAppMessaging;
  let fakeSessionManager: ISessionManager;
  let fakeMessageHandler: IMessageHandler;
  let fakeRateLimitService: RateLimitService;

  beforeEach(() => {
    jest.clearAllMocks();
    fakeSessionManager = {} as ISessionManager;
    fakeMessageHandler = {} as IMessageHandler;
    fakeRateLimitService = { enforceLimit: jest.fn().mockResolvedValue(undefined) } as unknown as RateLimitService;
    messaging = new WhatsAppMessaging(fakeSessionManager, fakeMessageHandler, fakeRateLimitService);
  });

  describe("sendMessage", () => {
    it("throws a 503 AppError when the company has no WhatsApp session at all", async () => {
      mockHttp.get.mockResolvedValue({ data: [] });

      await expect(
        messaging.sendMessage("573001234567", "hi", { companyId: "company1", conversationId: "conv1", senderId: "user1" }),
      ).rejects.toMatchObject({ statusCode: 503 });

      expect(mockQueueService.enqueue).not.toHaveBeenCalled();
    });

    it("falls back to a RECONNECTING session when no CONNECTED session exists (high-availability enqueue)", async () => {
      mockHttp.get.mockResolvedValue({
        data: [{ sessionId: "sess1", status: "RECONNECTING" }],
      });
      mockChatService.upsertMessage.mockResolvedValue({
        id: "db-msg-1",
        whatsappMessageId: "generated-msg-id",
        companyId: "company1",
        content: "hi",
        createdAt: new Date(),
        metadata: {},
        status: "QUEUED",
      });

      const result = await messaging.sendMessage("573001234567", "hi", {
        companyId: "company1",
        conversationId: "conv1",
        senderId: "user1",
      });

      expect(result.sessionId).toBe("sess1");
      expect(mockQueueService.enqueue).toHaveBeenCalled();
    });

    it("saves the message as QUEUED and returns the DB row's real status — never a hardcoded 'SENT'", async () => {
      mockHttp.get.mockResolvedValue({
        data: [{ sessionId: "sess1", status: "CONNECTED" }],
      });
      mockChatService.upsertMessage.mockResolvedValue({
        id: "db-msg-1",
        whatsappMessageId: "generated-msg-id",
        companyId: "company1",
        content: "hi",
        createdAt: new Date("2024-01-01"),
        metadata: { foo: "bar" },
        status: "QUEUED",
      });

      const result = await messaging.sendMessage("573001234567", "hi", {
        companyId: "company1",
        conversationId: "conv1",
        senderId: "user1",
      });

      expect(mockChatService.upsertMessage).toHaveBeenCalledWith(
        expect.objectContaining({ status: "QUEUED", direction: "OUTBOUND" }),
      );
      expect(mockQueueService.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({
          companyId: "company1",
          conversationId: "conv1",
          to: "573001234567",
          text: "hi",
          metadata: expect.objectContaining({ dbId: "db-msg-1" }),
        }),
      );
      // The regression this test guards: this field used to be entirely
      // absent from the returned MessagePayload, and every caller upstream
      // (WhatsAppMessagingProvider) defaulted to a hardcoded "SENT".
      expect(result.status).toBe("QUEUED");
      expect(result.dbId).toBe("db-msg-1");
    });

    it("enforces the rate limit against the resolved session before enqueueing", async () => {
      mockHttp.get.mockResolvedValue({ data: [{ sessionId: "sess1", status: "CONNECTED" }] });
      mockChatService.upsertMessage.mockResolvedValue({
        id: "db-msg-1",
        whatsappMessageId: "generated-msg-id",
        companyId: "company1",
        content: "hi",
        createdAt: new Date(),
        metadata: {},
        status: "QUEUED",
      });

      await messaging.sendMessage("573001234567", "hi", {
        companyId: "company1",
        conversationId: "conv1",
        senderId: "user1",
      });

      expect(fakeRateLimitService.enforceLimit).toHaveBeenCalledWith("sess1");
    });
  });

  describe("executeQueuedMessage", () => {
    it("posts to whatsapp-service, marks the DB row SENT, and emits the correct 'sent' status event (not the old wrong event name)", async () => {
      mockHttp.post.mockResolvedValue({ data: { messageId: "wa-real-id" } });
      mockMessageRepo.update.mockResolvedValue({ id: "db-msg-1", conversationId: "conv1" });

      const result = await messaging.executeQueuedMessage("sess1", "573001234567", "hi", {
        companyId: "company1",
        conversationId: "conv1",
        senderId: "user1",
        dbId: "db-msg-1",
      });

      expect(mockMessageRepo.update).toHaveBeenCalledWith(
        "db-msg-1",
        expect.objectContaining({ status: "SENT", whatsappMessageId: "wa-real-id" }),
        "company1",
      );

      // index [0] belongs to the SocketEventEmitter OutboundMessageHandler's
      // own constructor eagerly creates (see WhatsAppMessaging's constructor
      // -> `new OutboundMessageHandler(sessionManager)`) during this test's
      // beforeEach — the one under test here is the most recent instance.
      const emitterInstance =
        MockSocketEventEmitter.mock.results[MockSocketEventEmitter.mock.results.length - 1].value;
      expect(emitterInstance.emitMessageStatus).toHaveBeenCalledWith(
        "db-msg-1",
        "conv1",
        "company1",
        "sent",
        undefined,
      );
      expect(result).toEqual(
        expect.objectContaining({ success: true, messageId: "wa-real-id" }),
      );
    });

    it("threads the originalTicketId from metadata into the socket emit when present", async () => {
      mockHttp.post.mockResolvedValue({ data: { messageId: "wa-real-id" } });
      mockMessageRepo.update.mockResolvedValue({ id: "db-msg-1", conversationId: "conv1" });

      await messaging.executeQueuedMessage("sess1", "573001234567", "hi", {
        companyId: "company1",
        conversationId: "conv1",
        senderId: "user1",
        dbId: "db-msg-1",
        metadata: { originalTicketId: "ticket-1" },
      });

      // index [0] belongs to the SocketEventEmitter OutboundMessageHandler's
      // own constructor eagerly creates (see WhatsAppMessaging's constructor
      // -> `new OutboundMessageHandler(sessionManager)`) during this test's
      // beforeEach — the one under test here is the most recent instance.
      const emitterInstance =
        MockSocketEventEmitter.mock.results[MockSocketEventEmitter.mock.results.length - 1].value;
      expect(emitterInstance.emitMessageStatus).toHaveBeenCalledWith(
        "db-msg-1",
        "conv1",
        "company1",
        "sent",
        "ticket-1",
      );
    });

    it("does not emit a socket event when there is no dbId to update (nothing to notify about)", async () => {
      mockHttp.post.mockResolvedValue({ data: { messageId: "wa-real-id" } });
      // OutboundMessageHandler's own constructor (invoked via `new
      // WhatsAppMessaging(...)` in beforeEach) already eagerly builds one
      // SocketEventEmitter — capture that baseline so we can assert
      // executeQueuedMessage itself doesn't construct another one.
      const callsBeforeAct = MockSocketEventEmitter.mock.calls.length;

      await messaging.executeQueuedMessage("sess1", "573001234567", "hi", {
        companyId: "company1",
        conversationId: "conv1",
        senderId: "user1",
      });

      expect(mockMessageRepo.update).not.toHaveBeenCalled();
      expect(MockSocketEventEmitter.mock.calls.length).toBe(callsBeforeAct);
    });

    it("propagates the error and does not touch the DB when the HTTP call to whatsapp-service fails", async () => {
      mockHttp.post.mockRejectedValue(new Error("ECONNREFUSED"));

      await expect(
        messaging.executeQueuedMessage("sess1", "573001234567", "hi", {
          companyId: "company1",
          conversationId: "conv1",
          senderId: "user1",
          dbId: "db-msg-1",
        }),
      ).rejects.toThrow("ECONNREFUSED");

      expect(mockMessageRepo.update).not.toHaveBeenCalled();
    });
  });
});
