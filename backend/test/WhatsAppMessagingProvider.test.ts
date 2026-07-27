// Regression test for the outbound-status bug: WhatsAppMessagingProvider.send()
// used to hardcode `status: "SENT"` in its returned SendMessageResult even
// though the underlying whatsappMessagingService.sendMessage() call only
// enqueues the message (real status is "QUEUED" until the message.status
// socket event reports the true outcome later). This pins the fix: the
// provider must echo back whatever real status sendMessage() returned.

jest.mock("@/whatsapp", () => ({
  whatsappMessagingService: {
    sendMessage: jest.fn(),
  },
}));

jest.mock("@/services/TicketSyncService", () => ({
  ticketSyncService: {
    findPhoneByConversation: jest.fn(),
  },
}));

import { Channel } from "@prisma/client";
import { WhatsAppMessagingProvider } from "../src/services/messaging/providers/WhatsAppMessagingProvider";
import { whatsappMessagingService } from "../src/whatsapp";
import { ticketSyncService } from "../src/services/TicketSyncService";
import { ConversationWithContact } from "../src/services/messaging/interfaces/IMessagingProvider";
import { ReplyDTO } from "../src/types/conversation.types";

const mockMessagingService = whatsappMessagingService as unknown as { sendMessage: jest.Mock };
const mockTicketSync = ticketSyncService as unknown as { findPhoneByConversation: jest.Mock };

function makeConversation(overrides: Record<string, unknown> = {}): ConversationWithContact {
  return {
    id: "conv1",
    channelId: "573001234567",
    isGroup: false,
    contact: { phone: "573001234567" },
    ...overrides,
  } as unknown as ConversationWithContact;
}

function makeDto(overrides: Partial<ReplyDTO> = {}): ReplyDTO {
  return {
    companyId: "company1",
    userId: "user1",
    conversationId: "conv1",
    content: "hello",
    ...overrides,
  } as ReplyDTO;
}

describe("WhatsAppMessagingProvider", () => {
  let provider: WhatsAppMessagingProvider;

  beforeEach(() => {
    jest.clearAllMocks();
    provider = new WhatsAppMessagingProvider();
  });

  it("supports only the WHATSAPP channel", () => {
    expect(provider.supports(Channel.WHATSAPP)).toBe(true);
    expect(provider.supports(Channel.EMAIL)).toBe(false);
  });

  it("echoes the real status returned by sendMessage() — never a hardcoded 'SENT'", async () => {
    mockMessagingService.sendMessage.mockResolvedValue({
      dbId: "db-msg-1",
      messageId: "wa-id-1",
      content: "hello",
      timestamp: new Date("2024-01-01"),
      status: "QUEUED",
      metadata: {},
    });

    const result = await provider.send(makeDto(), makeConversation());

    expect(result.status).toBe("QUEUED");
    expect(result.id).toBe("db-msg-1");
  });

  it("falls back to 'QUEUED' when sendMessage() returns no status at all", async () => {
    mockMessagingService.sendMessage.mockResolvedValue({
      dbId: "db-msg-1",
      messageId: "wa-id-1",
      content: "hello",
      timestamp: new Date("2024-01-01"),
      status: undefined,
      metadata: {},
    });

    const result = await provider.send(makeDto(), makeConversation());

    expect(result.status).toBe("QUEUED");
  });

  it("propagates whatever real status sendMessage() reports (e.g. already FAILED)", async () => {
    mockMessagingService.sendMessage.mockResolvedValue({
      dbId: "db-msg-1",
      messageId: "wa-id-1",
      content: "hello",
      timestamp: new Date("2024-01-01"),
      status: "FAILED",
      metadata: {},
    });

    const result = await provider.send(makeDto(), makeConversation());

    expect(result.status).toBe("FAILED");
  });

  it("sends directly to the conversation's channelId for a group chat, bypassing phone resolution", async () => {
    mockMessagingService.sendMessage.mockResolvedValue({
      dbId: "db-msg-1",
      messageId: "wa-id-1",
      content: "hello",
      timestamp: new Date(),
      status: "QUEUED",
      metadata: {},
    });

    await provider.send(
      makeDto(),
      makeConversation({ id: "conv-group", channelId: "123-456@g.us", isGroup: true, contact: undefined }),
    );

    expect(mockMessagingService.sendMessage).toHaveBeenCalledWith(
      "123-456@g.us",
      "hello",
      expect.any(Object),
    );
    expect(mockTicketSync.findPhoneByConversation).not.toHaveBeenCalled();
  });

  it("resolves the recipient phone from the contact record when channelId isn't a clean phone", async () => {
    mockMessagingService.sendMessage.mockResolvedValue({
      dbId: "db-msg-1",
      messageId: "wa-id-1",
      content: "hello",
      timestamp: new Date(),
      status: "QUEUED",
      metadata: {},
    });

    await provider.send(
      makeDto(),
      makeConversation({ channelId: "notaphone12", contact: { phone: "573009998877" } }),
    );

    expect(mockMessagingService.sendMessage).toHaveBeenCalledWith(
      "573009998877@s.whatsapp.net",
      "hello",
      expect.any(Object),
    );
  });

  it("falls back to TicketSyncService when neither channelId nor the contact record has a usable phone", async () => {
    mockTicketSync.findPhoneByConversation.mockResolvedValue("573007776655");
    mockMessagingService.sendMessage.mockResolvedValue({
      dbId: "db-msg-1",
      messageId: "wa-id-1",
      content: "hello",
      timestamp: new Date(),
      status: "QUEUED",
      metadata: {},
    });

    await provider.send(
      makeDto(),
      makeConversation({ channelId: "notaphone12", contact: undefined }),
    );

    expect(mockTicketSync.findPhoneByConversation).toHaveBeenCalledWith("company1", "conv1");
    expect(mockMessagingService.sendMessage).toHaveBeenCalledWith(
      "573007776655@s.whatsapp.net",
      "hello",
      expect.any(Object),
    );
  });

  it("throws a 400 AppError when no recipient phone can be determined at all", async () => {
    mockTicketSync.findPhoneByConversation.mockResolvedValue(null);

    await expect(
      provider.send(makeDto(), makeConversation({ channelId: "x", contact: undefined })),
    ).rejects.toMatchObject({ statusCode: 400 });

    expect(mockMessagingService.sendMessage).not.toHaveBeenCalled();
  });
});
