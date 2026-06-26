/// <reference types="jest" />
import { GoogleCalendarService } from "../src/services/GoogleCalendarService";
import { userRepository } from "../src/repositories/UserRepository";

jest.mock("../src/repositories/UserRepository", () => {
  const mockInstance = { findFirst: jest.fn(), update: jest.fn(), findMany: jest.fn() };
  return { UserRepository: jest.fn(() => mockInstance), userRepository: mockInstance };
});

const userRepo = userRepository as unknown as Record<string, jest.Mock>;

const userId = "user_123";
const activity = {
  subject: "Demo",
  description: "Reunión de demo",
  dueDate: new Date("2026-07-01T15:00:00.000Z"),
  participantIds: [],
};

describe("GoogleCalendarService (guardas sin conexión)", () => {
  beforeEach(() => jest.clearAllMocks());

  it("createMeetingEvent devuelve null si el usuario no tiene Google Calendar conectado", async () => {
    userRepo.findFirst.mockResolvedValue({
      id: userId,
      companyId: "c1",
      googleCalendarToken: null,
      googleCalendarRefreshToken: null,
      email: "a@b.com",
    });

    const result = await GoogleCalendarService.createMeetingEvent(userId, activity);

    expect(result).toBeNull();
    // No intenta crear/actualizar nada si no hay conexión.
    expect(userRepo.update).not.toHaveBeenCalled();
  });

  it("createMeetingEvent devuelve null si el usuario no existe", async () => {
    userRepo.findFirst.mockResolvedValue(null);
    const result = await GoogleCalendarService.createMeetingEvent(userId, activity);
    expect(result).toBeNull();
  });

  it("deleteMeetingEvent no falla cuando no hay tokens (no-op)", async () => {
    userRepo.findFirst.mockResolvedValue({
      googleCalendarToken: null,
      googleCalendarRefreshToken: null,
    });
    await expect(
      GoogleCalendarService.deleteMeetingEvent(userId, "evt_1"),
    ).resolves.toBeUndefined();
  });

  it("updateMeetingEvent no falla cuando no hay tokens (no-op)", async () => {
    userRepo.findFirst.mockResolvedValue({
      googleCalendarToken: null,
      googleCalendarRefreshToken: null,
    });
    await expect(
      GoogleCalendarService.updateMeetingEvent(userId, "evt_1", activity),
    ).resolves.toBeUndefined();
  });
});
