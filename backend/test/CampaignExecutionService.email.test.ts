// CampaignExecutionService imports whatsappService from "@/whatsapp", which
// transitively pulls in @whiskeysockets/baileys — an ESM-only package Jest
// can't parse. Stub the module before importing the service under test;
// these tests only exercise the EMAIL-channel path, never whatsappService.
jest.mock("../src/whatsapp", () => ({
  whatsappService: { sendMessage: jest.fn() },
}));

import { campaignExecutionService } from "../src/services/CampaignExecutionService";
import { contactRepository } from "../src/repositories/ContactRepository";
import { emailService } from "../src/services/email/emailService";
import { companySettingsService } from "../src/services/CompanySettingsService";

jest.mock("../src/repositories/ContactRepository", () => ({
  contactRepository: { findMany: jest.fn() },
}));

jest.mock("../src/services/email/emailService", () => ({
  emailService: { sendEmail: jest.fn() },
}));

jest.mock("../src/services/CompanySettingsService", () => ({
  companySettingsService: { getSenderConfig: jest.fn() },
}));

const companyId = "company_123";

describe("CampaignExecutionService.getAudience — channel-aware targeting", () => {
  beforeEach(() => jest.clearAllMocks());

  it("filters by email + emailOptOut:false for an EMAIL campaign, not phone", async () => {
    (contactRepository.findMany as jest.Mock).mockResolvedValue([]);

    await campaignExecutionService.getAudience(companyId, [], "EMAIL");

    expect(contactRepository.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          companyId,
          email: { not: null },
          emailOptOut: false,
        }),
      }),
    );
    const call = (contactRepository.findMany as jest.Mock).mock.calls[0][0];
    expect(call.where.phone).toBeUndefined();
  });

  it("filters by phone for a WHATSAPP campaign, not email/opt-out", async () => {
    (contactRepository.findMany as jest.Mock).mockResolvedValue([]);

    await campaignExecutionService.getAudience(companyId, [], "WHATSAPP");

    const call = (contactRepository.findMany as jest.Mock).mock.calls[0][0];
    expect(call.where.phone).toEqual({ not: null });
    expect(call.where.email).toBeUndefined();
    expect(call.where.emailOptOut).toBeUndefined();
  });
});

describe("CampaignExecutionService.sendCampaignEmail", () => {
  beforeEach(() => jest.clearAllMocks());

  it("throws instead of silently no-oping when the contact has no email", async () => {
    await expect(
      campaignExecutionService.sendCampaignEmail(
        { id: "c1", name: "Ana", phone: null, email: null },
        "Campaña Julio",
        "Hola {{name}}",
        "Cuerpo",
        companyId,
        "camp_1",
      ),
    ).rejects.toThrow("Contact has no email address");

    expect(emailService.sendEmail).not.toHaveBeenCalled();
  });

  it("renders variables, includes a working unsubscribe link, and links the campaignId", async () => {
    (companySettingsService.getSenderConfig as jest.Mock).mockResolvedValue({
      fromEmail: "ventas@empresa.com",
      fromName: "Empresa SA",
    });
    (emailService.sendEmail as jest.Mock).mockResolvedValue({ id: "email_1" });

    await campaignExecutionService.sendCampaignEmail(
      { id: "contact_42", name: "Ana", phone: null, email: "ana@example.com" },
      "Campaña Julio",
      "Hola {{name}}",
      "Oferta especial para {{name}}",
      companyId,
      "camp_1",
    );

    expect(emailService.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId,
        from: '"Empresa SA" <ventas@empresa.com>',
        to: ["ana@example.com"],
        subject: "Hola Ana",
        contactId: "contact_42",
        campaignId: "camp_1",
      }),
    );

    const call = (emailService.sendEmail as jest.Mock).mock.calls[0][0];
    expect(call.bodyHtml).toContain("Oferta especial para Ana");
    expect(call.bodyHtml).toContain(`/public/email/unsubscribe/${companyId}/contact_42/`);
    expect(call.bodyHtml).toContain("Darse de baja");
  });
});
