import { MessageOrchestrator } from "../MessageOrchestrator";
import { ContactRepository } from "@/repositories/ContactRepository";
import { ConversationRepository } from "@/repositories/ConversationRepository";
import { MessageRepository } from "@/repositories/MessageRepository";
import { DomainEventBus, DomainEventType } from "@/events/DomainEventBus";
import { IncomingMessagePayload } from "@/services/interfaces/MessageTypes";
import { prisma } from "@/config/database";
import { prisma } from "@/config/database";

// 🎭 MOCKS
jest.mock("@/repositories/ContactRepository");
jest.mock("@/repositories/ConversationRepository");
jest.mock("@/repositories/MessageRepository");
jest.mock("@/events/DomainEventBus", () => {
  return {
    DomainEventBus: {
      getInstance: jest.fn().mockReturnValue({
        publish: jest.fn(), // Instance method
      }),
    },
    DomainEventType: {
      // Enum needs to be preserved or mocked
      MESSAGE_RECEIVED: "message.received",
    },
  };
});
jest.mock("@/config/database", () => ({
  prisma: {
    user: {
      upsert: jest.fn(),
    },
  },
}));
jest.mock("@/utils/logger");

describe("MessageOrchestrator", () => {
  let orchestrator: MessageOrchestrator;

  // Mock Instances
  let mockContactRepo: jest.Mocked<ContactRepository>;
  let mockConversationRepo: jest.Mocked<ConversationRepository>;
  let mockMessageRepo: jest.Mocked<MessageRepository>;
  let mockEventBus: unknown;

  // Base Payload
  const basePayload: IncomingMessagePayload = {
    remoteJid: "573001234567",
    companyId: "comp_123",
    text: "Hello World",
    isOutbound: false,
    hasMedia: false,
    senderName: "Juan Perez",
    messageTimestamp: Date.now(),
    sessionId: "sess_1",
  } as unknown as IncomingMessagePayload; // Cast as any because some props might be missing in partial mock

  beforeEach(() => {
    jest.clearAllMocks();

    // Reset Class Mocks
    mockContactRepo = new ContactRepository() as jest.Mocked<ContactRepository>;
    mockConversationRepo =
      new ConversationRepository() as jest.Mocked<ConversationRepository>;
    mockMessageRepo = new MessageRepository() as jest.Mocked<MessageRepository>;

    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-expect-error
    mockEventBus = DomainEventBus.getInstance();

    orchestrator = new MessageOrchestrator(
      mockContactRepo,
      mockConversationRepo,
      mockMessageRepo,
      mockEventBus,
    );
  });

  // 🧪 ESCENARIO A: Mensaje de un contacto nuevo
  it("should create a new contact if it does not exist", async () => {
    // Setup
    mockContactRepo.findByPhone.mockResolvedValue(null); // Contact not found
    mockContactRepo.create.mockResolvedValue({
      id: "new_contact_id",
      name: "Juan Perez",
    } as unknown as never);

    (prisma.user.upsert as jest.Mock).mockResolvedValue({
      id: "user_1",
      role: "USER",
    });

    mockConversationRepo.findByChannelId.mockResolvedValue({
      id: "conv_1",
    } as unknown as never);
    mockMessageRepo.findDuplicate.mockResolvedValue(null);
    mockMessageRepo.create.mockResolvedValue({
      id: "msg_1",
    } as unknown as never);

    // Act
    await orchestrator.processIncoming(basePayload);

    // Assert
    expect(mockContactRepo.findByPhone).toHaveBeenCalledWith(
      basePayload.companyId,
      basePayload.remoteJid,
    );
    expect(mockContactRepo.create).toHaveBeenCalledWith(
      basePayload.companyId,
      basePayload.remoteJid,
      expect.anything(),
    );
    expect(mockEventBus.publish).toHaveBeenCalledWith(
      DomainEventType.MESSAGE_RECEIVED,
      expect.objectContaining({
        message: expect.objectContaining({ id: "msg_1" }),
      }),
    );
  });

  // 🧪 ESCENARIO B: Mensaje de contacto existente
  it("should reuse existing contact and NOT create a new one", async () => {
    // Setup
    mockContactRepo.findByPhone.mockResolvedValue({
      id: "existing_contact_id",
      name: "Old Name",
    } as unknown as never);

    (prisma.user.upsert as jest.Mock).mockResolvedValue({ id: "user_1" });
    mockConversationRepo.findByChannelId.mockResolvedValue({
      id: "conv_1",
    } as unknown as never);
    mockMessageRepo.create.mockResolvedValue({
      id: "msg_2",
    } as unknown as never);

    // Act
    await orchestrator.processIncoming(basePayload);

    // Assert
    expect(mockContactRepo.create).not.toHaveBeenCalled();
    expect(prisma.user.upsert).toHaveBeenCalled(); // Should still update User/Sender
  });

  // 🧪 ESCENARIO C: Error en el repositorio
  it("should propagate repository errors to be handled by the caller", async () => {
    // Setup - Simulate DB crash
    mockContactRepo.findByPhone.mockRejectedValue(
      new Error("Database Connection Failed"),
    );

    // Act & Assert
    await expect(orchestrator.processIncoming(basePayload)).rejects.toThrow(
      "Database Connection Failed",
    );

    // Ensure flow stopped
    expect(mockMessageRepo.create).not.toHaveBeenCalled();
  });
});
