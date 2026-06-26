/// <reference types="jest" />
import { googleAuthCrudService } from "../src/services/GoogleAuthCrudService";
import { userRepository } from "../src/repositories/UserRepository";

// runAsSystem solo ejecuta el callback (sin contexto de tenant real en tests).
jest.mock("../src/config/tenantContext", () => ({
  __esModule: true,
  default: { runAsSystem: (fn: () => unknown) => fn() },
}));

jest.mock("../src/repositories/UserRepository", () => {
  const mockInstance = { findFirst: jest.fn(), update: jest.fn(), create: jest.fn() };
  return { UserRepository: jest.fn(() => mockInstance), userRepository: mockInstance };
});

const userRepo = userRepository as unknown as Record<string, jest.Mock>;

const userId = "user_123";
const companyId = "company_abc";

describe("GoogleAuthCrudService", () => {
  beforeEach(() => jest.clearAllMocks());

  describe("saveCalendarTokens", () => {
    it("devuelve null si el usuario no existe (no actualiza)", async () => {
      userRepo.findFirst.mockResolvedValue(null);
      const result = await googleAuthCrudService.saveCalendarTokens(userId, "at", "rt");
      expect(result).toBeNull();
      expect(userRepo.update).not.toHaveBeenCalled();
    });

    it("devuelve null si el usuario no tiene companyId", async () => {
      userRepo.findFirst.mockResolvedValue({ id: userId, companyId: null });
      const result = await googleAuthCrudService.saveCalendarTokens(userId, "at", "rt");
      expect(result).toBeNull();
      expect(userRepo.update).not.toHaveBeenCalled();
    });

    it("guarda ambos tokens cuando el usuario es válido", async () => {
      userRepo.findFirst.mockResolvedValue({ id: userId, companyId });
      userRepo.update.mockResolvedValue({ id: userId });
      await googleAuthCrudService.saveCalendarTokens(userId, "access-1", "refresh-1");
      expect(userRepo.update).toHaveBeenCalledWith(userId, companyId, {
        googleCalendarToken: "access-1",
        googleCalendarRefreshToken: "refresh-1",
      });
    });
  });

  describe("disconnectCalendar", () => {
    it("limpia ambos tokens", async () => {
      userRepo.findFirst.mockResolvedValue({ id: userId, companyId });
      userRepo.update.mockResolvedValue({ id: userId });
      await googleAuthCrudService.disconnectCalendar(userId);
      expect(userRepo.update).toHaveBeenCalledWith(userId, companyId, {
        googleCalendarToken: null,
        googleCalendarRefreshToken: null,
      });
    });

    it("no falla si el usuario no tiene companyId", async () => {
      userRepo.findFirst.mockResolvedValue({ id: userId, companyId: null });
      await expect(googleAuthCrudService.disconnectCalendar(userId)).resolves.toBeUndefined();
      expect(userRepo.update).not.toHaveBeenCalled();
    });
  });

  describe("getCalendarStatus", () => {
    it("true cuando hay refresh token", async () => {
      userRepo.findFirst.mockResolvedValue({
        googleCalendarToken: null,
        googleCalendarRefreshToken: "rt",
      });
      await expect(googleAuthCrudService.getCalendarStatus(userId)).resolves.toBe(true);
    });

    it("false cuando no hay tokens", async () => {
      userRepo.findFirst.mockResolvedValue({
        googleCalendarToken: null,
        googleCalendarRefreshToken: null,
      });
      await expect(googleAuthCrudService.getCalendarStatus(userId)).resolves.toBe(false);
    });

    it("false cuando el usuario no existe", async () => {
      userRepo.findFirst.mockResolvedValue(null);
      await expect(googleAuthCrudService.getCalendarStatus(userId)).resolves.toBe(false);
    });
  });
});
