// 1. Mocks de dependencias externas elevados por Jest
jest.mock("@whiskeysockets/baileys", () => ({
  __esModule: true,
  default: jest.fn(),
  Browsers: { ubuntu: jest.fn() },
  fetchLatestBaileysVersion: jest.fn(),
}));

// 2. Getter seguro para obtener el callback del middleware de Prisma de forma global (inmune al TDZ de Jest)
const getAllOperationsCallback = (): ((options: {
  model: string;
  operation: string;
  args: Record<string, unknown>;
  query: (args: Record<string, unknown>) => Promise<unknown>;
}) => Promise<unknown>) | null => {
  return (global as any).allOperationsCallback || null;
};

// 3. Proxy dinámico para simular el cliente extendido de Prisma sin tocar la base de datos real
const mockExtendedClient = new Proxy({} as Record<string, unknown>, {
  get(_target, modelName: string) {
    if (modelName.startsWith("$")) {
      return jest.fn().mockResolvedValue({ success: true });
    }

    return new Proxy({} as Record<string, unknown>, {
      get(_modelTarget, operationName: string) {
        return async (args: Record<string, unknown>) => {
          const callback = getAllOperationsCallback();
          if (callback) {
            const formattedModel = modelName.charAt(0).toUpperCase() + modelName.slice(1);
            
            // Creamos un spy dedicado para capturar los argumentos finales pasados por el middleware RLS
            const operationSpy = jest.fn().mockImplementation((finalArgs: Record<string, unknown>) => 
              Promise.resolve({ success: true, finalArgs, operationCalled: operationName })
            );

            return callback({
              model: formattedModel,
              operation: operationName,
              args: args || {},
              query: operationSpy,
            });
          }
          return { success: true, finalArgs: args, operationCalled: operationName };
        };
      },
    });
  },
});

// 4. Mock del cliente de Prisma que inyecta nuestro cliente extendido simulado con el middleware activo
jest.mock("@prisma/client", () => {
  const actual = jest.requireActual("@prisma/client");
  return {
    ...actual,
    PrismaClient: jest.fn().mockImplementation(() => {
      return {
        $connect: jest.fn().mockResolvedValue(undefined),
        $disconnect: jest.fn().mockResolvedValue(undefined),
        $on: jest.fn(),
        $extends: jest.fn().mockImplementation((extension: {
          query?: {
            $allModels?: {
              $allOperations?: (options: {
                model: string;
                operation: string;
                args: Record<string, unknown>;
                query: (args: Record<string, unknown>) => Promise<unknown>;
              }) => Promise<unknown>;
            };
          };
        }) => {
          if (extension?.query?.$allModels?.$allOperations) {
            (global as any).allOperationsCallback = extension.query.$allModels.$allOperations;
          }
          return mockExtendedClient;
        }),
      };
    }),
  };
});

// 5. IMPORTAMOS LOS MÓDULOS DE DOMINIO (Una vez que el entorno de variables y mocks está 100% listo)
import { prisma } from "../../src/config/database";
import TenantContextManager from "../../src/config/tenantContext";

describe("CRM Multi-Tenant Isolation & RLS Security Audit Tests", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("1. Tenant Context Validation (Defense in Depth)", () => {
    it("should deny access to non-global models (e.g., Contact) when operating outside of an active Tenant Context", async () => {
      // Verificamos que se lance un error de violación de seguridad si intentamos consultar sin contexto
      await expect(prisma.contact.findMany({ where: { phone: "123456" } }))
        .rejects.toThrow(/SECURITY VIOLATION/);
    });

    it("should inject the active companyId into standard non-global models queries", async () => {
      const activeTenantId = "company-sentry-saas-123";

      const result = await TenantContextManager.run(
        { companyId: activeTenantId, userId: "user-abc" },
        async () => {
          return (await prisma.contact.findMany({
            where: { phone: "987654321" },
          })) as unknown as { finalArgs: { where: { companyId: string; phone: string } } };
        }
      );

      expect(result.finalArgs.where.companyId).toBe(activeTenantId);
      expect(result.finalArgs.where.phone).toBe("987654321");
    });
  });

  describe("2. Global Model Bypass Audit", () => {
    it("should allow querying global system models (e.g., Company, Plan, User) without throwing a security violation", async () => {
      const result = (await prisma.company.findFirst({
        where: { id: "sys-company" },
      })) as unknown as { finalArgs: { where: { id: string; companyId?: string } } };

      expect(result.finalArgs.where.id).toBe("sys-company");
      expect(result.finalArgs.where.companyId).toBeUndefined();
    });
  });

  describe("3. System Operations Context Bypass", () => {
    it("should allow complete global database query permissions when operating inside runAsSystem context", async () => {
      const result = await TenantContextManager.runAsSystem(async () => {
        return (await prisma.contact.findMany({
          where: { name: "System Admin Query" },
        })) as unknown as { finalArgs: { where: { name: string; companyId?: string } } };
      });

      expect(result.finalArgs.where.name).toBe("System Admin Query");
      expect(result.finalArgs.where.companyId).toBeUndefined();
    });
  });

  describe("4. Soft Delete Enforcement & Bypass Auditing", () => {
    it("should automatically inject deletedAt: null into soft-delete eligible models when includeDeleted is false or omitted", async () => {
      const activeTenantId = "company-tenant-soft";

      const result = await TenantContextManager.run(
        { companyId: activeTenantId },
        async () => {
          return (await prisma.contact.findMany({})) as unknown as {
            finalArgs: { where: { companyId: string; deletedAt: null | Date } };
          };
        }
      );

      expect(result.finalArgs.where.companyId).toBe(activeTenantId);
      expect(result.finalArgs.where.deletedAt).toBeNull();
    });

    it("should bypass the deletedAt: null filter and cleanly remove includeDeleted from arguments when includeDeleted is true", async () => {
      const activeTenantId = "company-tenant-soft";

      const result = await TenantContextManager.run(
        { companyId: activeTenantId },
        async () => {
          // Usamos cast 'unknown' para simular propiedad inyectada dinámicamente
          return (await (prisma.contact.findMany as unknown as (args: unknown) => Promise<unknown>)({
            includeDeleted: true,
          })) as {
            finalArgs: { where: { companyId: string; deletedAt?: null | Date }; includeDeleted?: boolean };
          };
        }
      );

      expect(result.finalArgs.where.companyId).toBe(activeTenantId);
      expect(result.finalArgs.where.deletedAt).toBeUndefined();
      expect(result.finalArgs.includeDeleted).toBeUndefined();
    });
  });

  describe("5. Mutative Operations and RLS Immutable Integrity", () => {
    it("should secure UPDATE operations by matching on companyId and cleaning up companyId modification payload attempts", async () => {
      const activeTenantId = "company-sandbox-456";

      const result = await TenantContextManager.run(
        { companyId: activeTenantId },
        async () => {
          return (await prisma.contact.update({
            where: { id: "contact-uuid" },
            data: { name: "Malicious Updated Name", companyId: "hacker-company" } as unknown as Record<string, unknown>,
          })) as unknown as {
            finalArgs: { where: { id: string; companyId: string }; data: { name: string; companyId?: string } };
          };
        }
      );

      expect(result.finalArgs.where.id).toBe("contact-uuid");
      expect(result.finalArgs.where.companyId).toBe(activeTenantId);
      expect(result.finalArgs.data.name).toBe("Malicious Updated Name");
      expect(result.finalArgs.data.companyId).toBeUndefined();
    });
  });

  describe("6. findUnique to findFirst Conversion & Compound Keys", () => {
    it("should successfully convert findUnique to findFirst and flatten compound unique constraints", async () => {
      const activeTenantId = "company-sandbox-456";

      const result = await TenantContextManager.run(
        { companyId: activeTenantId },
        async () => {
          return (await prisma.message.findUnique({
            where: {
              companyId_whatsappMessageId: {
                companyId: activeTenantId,
                whatsappMessageId: "AC1234567890",
              },
            },
          })) as unknown as {
            finalArgs: { where: { whatsappMessageId: string; companyId: string; companyId_whatsappMessageId?: unknown } };
          };
        }
      );

      expect(result.finalArgs.where.companyId).toBe(activeTenantId);
      expect(result.finalArgs.where.whatsappMessageId).toBe("AC1234567890");
      expect(result.finalArgs.where.companyId_whatsappMessageId).toBeUndefined();
    });
  });
});
