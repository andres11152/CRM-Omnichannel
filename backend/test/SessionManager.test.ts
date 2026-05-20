import { SessionManager } from "../src/whatsapp/providers/SessionManager";
import { whatsappSessionRepository } from "../src/repositories/WhatsAppSessionRepository";
import makeWASocket from "@whiskeysockets/baileys";
import { IAuthProvider } from "../src/whatsapp/core/interfaces/IAuthProvider";

// Mock dependencies
jest.mock("@whiskeysockets/baileys", () => {
  return {
    __esModule: true,
    default: jest.fn().mockReturnValue({
      ev: {
        on: jest.fn(),
      },
    }),
    Browsers: {
      ubuntu: jest.fn().mockReturnValue("mock-browser"),
    },
    fetchLatestBaileysVersion: jest.fn().mockResolvedValue({
      version: [2, 3000, 1023480872],
      isLatest: true,
    }),
  };
});

jest.mock("../src/repositories/WhatsAppSessionRepository", () => {
  return {
    whatsappSessionRepository: {
      findSystemSession: jest.fn(),
    },
  };
});

jest.mock("../src/config/tenantContext", () => {
  return {
    __esModule: true,
    default: {
      runAsSystem: jest.fn((callback: () => Promise<unknown>) => callback()),
    },
  };
});

jest.mock("../src/whatsapp/providers/SessionLogger", () => {
  return {
    createSessionLogger: jest.fn(),
    sessionModuleLogger: {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
    },
  };
});

jest.mock("../src/whatsapp/providers/SimpleStore", () => {
  return {
    SimpleInMemoryStore: jest.fn().mockImplementation(() => {
      return {
        bind: jest.fn(),
        enablePersistence: jest.fn().mockResolvedValue(true),
        writeToRedis: jest.fn().mockResolvedValue(true),
        flush: jest.fn(),
        chats: new Map(),
        messages: {},
        contacts: {},
        lidToPhone: {},
      };
    }),
  };
});

jest.mock("../src/whatsapp/providers/ConnectionHealer", () => {
  return {
    ConnectionHealer: jest.fn().mockImplementation(() => {
      return {
        hasGuardFlag: jest.fn().mockReturnValue(false),
        cancelReconnect: jest.fn(),
        cleanupSession: jest.fn(),
        hasReconnectPending: jest.fn().mockReturnValue(false),
      };
    }),
  };
});

describe("SessionManager - Proxy Integration", () => {
  let authProviderMock: IAuthProvider;
  let sessionManager: SessionManager;

  beforeEach(() => {
    jest.clearAllMocks();

    authProviderMock = {
      loadState: jest.fn().mockResolvedValue({
        state: { creds: {}, keys: {} },
        saveCreds: jest.fn(),
      }),
      saveCredentials: jest.fn(),
      clearCredentials: jest.fn(),
    };

    sessionManager = new SessionManager(authProviderMock);
  });

  it("should initialize WASocket with proxy agent if proxyUrl is configured in database", async () => {
    const mockSessionId = "session_with_proxy";
    const mockCompanyId = "company_123";
    const mockProxyUrl = "socks5://user:pass@127.0.0.1:1080";

    // Mock DB response
    (whatsappSessionRepository.findSystemSession as jest.Mock).mockResolvedValue({
      sessionId: mockSessionId,
      companyId: mockCompanyId,
      proxyUrl: mockProxyUrl,
    });

    await sessionManager.initializeSession({
      sessionId: mockSessionId,
      companyId: mockCompanyId,
    });

    // Verify DB was queried
    expect(whatsappSessionRepository.findSystemSession).toHaveBeenCalledWith(mockSessionId);

    // Verify makeWASocket was called with proxy agents
    expect(makeWASocket).toHaveBeenCalled();
    const options = (makeWASocket as jest.Mock).mock.calls[0][0];
    expect(options.agent).toBeDefined();
    expect(options.fetchAgent).toBeDefined();
  });

  it("should initialize WASocket without proxy agent if proxyUrl is not configured", async () => {
    const mockSessionId = "session_no_proxy";
    const mockCompanyId = "company_123";

    // Mock DB response without proxy
    (whatsappSessionRepository.findSystemSession as jest.Mock).mockResolvedValue({
      sessionId: mockSessionId,
      companyId: mockCompanyId,
      proxyUrl: null,
    });

    await sessionManager.initializeSession({
      sessionId: mockSessionId,
      companyId: mockCompanyId,
    });

    expect(makeWASocket).toHaveBeenCalled();
    const options = (makeWASocket as jest.Mock).mock.calls[0][0];
    expect(options.agent).toBeUndefined();
    expect(options.fetchAgent).toBeUndefined();
  });
});
