/// <reference types="jest" />
import { initCronWorker } from "../src/services/queue/cronQueueService";
import { schedulerRepository } from "../src/repositories/SchedulerRepository";
import { messageRepository } from "../src/repositories/MessageRepository";
import { messageQueueService } from "../src/services/queue/messageQueueService";
import { gateway } from "../src/gateways/socketGateway";
import { SocketEventEmitter } from "../src/services/SocketEventEmitter";
import type { MediaPayload } from "../src/whatsapp/core/types/whatsapp.types";

// Capture the worker processor callback
let workerProcessor: ((job: unknown) => Promise<void>) | null = null;

jest.mock("bullmq", () => {
  return {
    Queue: jest.fn().mockImplementation(() => ({
      close: jest.fn(),
      add: jest.fn().mockResolvedValue({}),
      getRepeatableJobs: jest.fn().mockResolvedValue([]),
      removeRepeatableByKey: jest.fn().mockResolvedValue(true),
    })),
    Worker: jest.fn().mockImplementation((name, processor) => {
      workerProcessor = processor;
      return {
        on: jest.fn(),
        close: jest.fn(),
      };
    }),
  };
});

jest.mock("../src/config/bullmq", () => ({
  connection: {},
}));

jest.mock("../src/repositories/SchedulerRepository", () => ({
  schedulerRepository: {
    findPendingScheduledMessages: jest.fn(),
    findUsersForConversation: jest.fn(),
  },
}));

jest.mock("../src/repositories/MessageRepository", () => ({
  messageRepository: {
    update: jest.fn(),
  },
}));

jest.mock("../src/services/queue/messageQueueService", () => ({
  messageQueueService: {
    enqueue: jest.fn(),
  },
}));

jest.mock("../src/gateways/socketGateway", () => ({
  gateway: {},
}));

jest.mock("../src/services/SocketEventEmitter", () => {
  return {
    SocketEventEmitter: jest.fn().mockImplementation(() => ({
      emitMessageStatus: jest.fn(),
    })),
  };
});

jest.mock("@whiskeysockets/baileys", () => ({
  generateMessageID: jest.fn(() => "baileys_msg_123"),
}));

const mockSchedulerRepo = schedulerRepository as unknown as Record<string, jest.Mock>;
const mockMessageRepo = messageRepository as unknown as Record<string, jest.Mock>;
const mockMessageQueue = messageQueueService as unknown as Record<string, jest.Mock>;

describe("cronQueueService - scheduled-messages worker", () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    // Initialize worker to capture the processor
    await initCronWorker();
  });

  it("procesa mensajes programados de texto y los encola en la cola de envío", async () => {
    const mockMessage = {
      id: "msg_1",
      content: "Hola, este es un texto",
      senderId: "user_abc",
      conversationId: "conv_abc",
      conversation: {
        id: "conv_abc",
        companyId: "company_123",
        channelId: "573001234567",
      },
      metadata: {
        scheduledAt: new Date(Date.now() - 5000).toISOString(), // 5s in the past
      },
    };

    mockSchedulerRepo.findPendingScheduledMessages.mockResolvedValue([mockMessage]);

    expect(workerProcessor).not.toBeNull();
    if (workerProcessor) {
      await workerProcessor({ name: "scheduled-messages" });
    }

    // 1. Verificamos que buscó pendientes
    expect(mockSchedulerRepo.findPendingScheduledMessages).toHaveBeenCalled();

    // 2. Verificamos que actualizó el estado a QUEUED
    expect(mockMessageRepo.update).toHaveBeenCalledWith(
      "msg_1",
      expect.objectContaining({
        status: "QUEUED",
        whatsappMessageId: "baileys_msg_123",
      }),
      "company_123"
    );

    // 3. Verificamos que se encoló en el MessageQueueService
    expect(mockMessageQueue.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: "company_123",
        conversationId: "conv_abc",
        senderId: "user_abc",
        to: "573001234567",
        text: "Hola, este es un texto",
        media: undefined,
      })
    );
  });

  it("procesa notas de voz programadas forzando ptt: true y mimetype Opus", async () => {
    const mockMessage = {
      id: "msg_audio",
      content: "",
      senderId: "user_abc",
      conversationId: "conv_abc",
      conversation: {
        id: "conv_abc",
        companyId: "company_123",
        channelId: "573001234567",
      },
      metadata: {
        scheduledAt: new Date(Date.now() - 5000).toISOString(),
        isVoiceNote: true, // Nota de voz flag
        attachment: {
          url: "https://s3.amazonaws.com/voice.ogg",
          type: "audio",
          mimetype: "audio/ogg",
        },
      },
    };

    mockSchedulerRepo.findPendingScheduledMessages.mockResolvedValue([mockMessage]);

    if (workerProcessor) {
      await workerProcessor({ name: "scheduled-messages" });
    }

    // Verificamos el encolamiento y el mapeo del adjunto a MediaPayload
    expect(mockMessageQueue.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        media: expect.objectContaining({
          url: "https://s3.amazonaws.com/voice.ogg",
          type: "audio",
          mimetype: "audio/ogg; codecs=opus", // Mimetype corregido a Opus
          ptt: true, // Forzado a true
        }),
      })
    );
  });

  it("procesa imágenes programadas sin inyectar ptt o mimetype de audio", async () => {
    const mockMessage = {
      id: "msg_image",
      content: "Mira esta foto",
      senderId: "user_abc",
      conversationId: "conv_abc",
      conversation: {
        id: "conv_abc",
        companyId: "company_123",
        channelId: "573001234567",
      },
      metadata: {
        scheduledAt: new Date(Date.now() - 5000).toISOString(),
        attachment: {
          url: "https://s3.amazonaws.com/image.jpg",
          type: "image",
          mimetype: "image/jpeg",
        },
      },
    };

    mockSchedulerRepo.findPendingScheduledMessages.mockResolvedValue([mockMessage]);

    if (workerProcessor) {
      await workerProcessor({ name: "scheduled-messages" });
    }

    // Verificamos que mantiene la metadata original de imagen y no inyecta ptt/Opus
    expect(mockMessageQueue.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        media: {
          url: "https://s3.amazonaws.com/image.jpg",
          type: "image",
          mimetype: "image/jpeg",
          filename: undefined,
          ptt: false,
        },
      })
    );
  });
});
