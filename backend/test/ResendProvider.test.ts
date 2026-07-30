import { ResendProvider } from "../src/services/email/email.provider";
import { WebhookEventType } from "../src/types/email.types";

describe("ResendProvider", () => {
  const originalFetch = global.fetch;
  const originalApiKey = process.env.RESEND_API_KEY;

  beforeEach(() => {
    process.env.RESEND_API_KEY = "test_key";
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env.RESEND_API_KEY = originalApiKey;
  });

  describe("sendEmail", () => {
    it("posts to the Resend API and returns the provider messageId on success", async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ id: "resend_msg_123" }),
      }) as unknown as typeof fetch;

      const provider = new ResendProvider();
      const result = await provider.sendEmail({
        from: "no-reply@sentry.software",
        to: "cliente@gmail.com",
        subject: "Hola",
        htmlBody: "<p>Hola</p>",
      });

      expect(global.fetch).toHaveBeenCalledWith(
        "https://api.resend.com/emails",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({ Authorization: "Bearer test_key" }),
        }),
      );
      expect(result).toEqual({ success: true, messageId: "resend_msg_123" });
    });

    it("returns a failure result (not a throw) when Resend responds with an error", async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 422,
        json: async () => ({ message: "Invalid `from` field" }),
      }) as unknown as typeof fetch;

      const provider = new ResendProvider();
      const result = await provider.sendEmail({
        from: "not-a-verified-domain@example.com",
        to: "cliente@gmail.com",
        subject: "Hola",
        htmlBody: "<p>Hola</p>",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("Invalid `from` field");
    });

    it("fails fast without calling the API when RESEND_API_KEY is missing", async () => {
      delete process.env.RESEND_API_KEY;
      global.fetch = jest.fn();

      const provider = new ResendProvider();
      const result = await provider.sendEmail({
        from: "no-reply@sentry.software",
        to: "cliente@gmail.com",
        subject: "Hola",
        htmlBody: "<p>Hola</p>",
      });

      expect(result.success).toBe(false);
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  describe("parseWebhook", () => {
    const provider = new ResendProvider();

    it("maps known Resend event types to WebhookEventType", () => {
      const cases: Array<[string, WebhookEventType]> = [
        ["email.delivered", WebhookEventType.DELIVERED],
        ["email.opened", WebhookEventType.OPENED],
        ["email.clicked", WebhookEventType.CLICKED],
        ["email.bounced", WebhookEventType.BOUNCED],
        ["email.complained", WebhookEventType.SPAM],
      ];

      for (const [resendType, expected] of cases) {
        const event = provider.parseWebhook(
          { type: resendType, created_at: "2026-07-29T10:00:00Z", data: { email_id: "msg_1" } },
          {},
        );
        expect(event).toEqual({
          messageId: "msg_1",
          eventType: expected,
          timestamp: new Date("2026-07-29T10:00:00Z"),
          metadata: { email_id: "msg_1" },
        });
      }
    });

    it("returns null for an unrecognized event type instead of throwing", () => {
      const event = provider.parseWebhook(
        { type: "email.some_future_event", created_at: "2026-07-29T10:00:00Z", data: { email_id: "msg_1" } },
        {},
      );
      expect(event).toBeNull();
    });

    it("returns null when the payload has no email_id", () => {
      const event = provider.parseWebhook(
        { type: "email.opened", created_at: "2026-07-29T10:00:00Z", data: {} },
        {},
      );
      expect(event).toBeNull();
    });
  });
});
