import { Webhook } from "svix";
import { Response } from "express";
import { verifyResendWebhookSignature } from "../src/middleware/resendWebhookVerifyMiddleware";
import { RequestWithRawBody } from "../src/middleware/webhookVerifyMiddleware";

describe("verifyResendWebhookSignature", () => {
  const secret = "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw"; // Svix-format test secret
  const originalSecret = process.env.RESEND_WEBHOOK_SECRET;

  const buildReq = (bodyObj: unknown, headers: Record<string, string>): RequestWithRawBody => {
    const rawBody = Buffer.from(JSON.stringify(bodyObj));
    return { headers, rawBody } as unknown as RequestWithRawBody;
  };

  const mockRes = {} as Response;

  afterEach(() => {
    process.env.RESEND_WEBHOOK_SECRET = originalSecret;
  });

  it("calls next() with no error for a correctly signed payload", () => {
    process.env.RESEND_WEBHOOK_SECRET = secret;
    const wh = new Webhook(secret);
    const payload = { type: "email.opened", data: { email_id: "msg_1" } };
    const bodyStr = JSON.stringify(payload);
    const svixId = "msg_test_1";
    const svixTimestamp = String(Math.floor(Date.now() / 1000));
    const signature = wh.sign(svixId, new Date(Number(svixTimestamp) * 1000), bodyStr);

    const req = buildReq(payload, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": signature,
    });

    const next = jest.fn();
    verifyResendWebhookSignature(req, mockRes, next);

    expect(next).toHaveBeenCalledWith(); // called with no arguments = success
  });

  it("rejects a payload signed with the wrong secret", () => {
    process.env.RESEND_WEBHOOK_SECRET = secret;
    const wrongWh = new Webhook("whsec_wrongwrongwrongwrongwrongwrong12");
    const payload = { type: "email.opened", data: { email_id: "msg_1" } };
    const bodyStr = JSON.stringify(payload);
    const svixId = "msg_test_2";
    const svixTimestamp = String(Math.floor(Date.now() / 1000));
    const signature = wrongWh.sign(svixId, new Date(Number(svixTimestamp) * 1000), bodyStr);

    const req = buildReq(payload, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": signature,
    });

    const next = jest.fn();
    verifyResendWebhookSignature(req, mockRes, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
  });

  it("rejects when the svix-* headers are missing", () => {
    process.env.RESEND_WEBHOOK_SECRET = secret;
    const req = buildReq({ type: "email.opened" }, {});

    const next = jest.fn();
    verifyResendWebhookSignature(req, mockRes, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
  });

  it("bypasses verification (with a warning) when RESEND_WEBHOOK_SECRET is not configured", () => {
    delete process.env.RESEND_WEBHOOK_SECRET;
    const req = buildReq({ type: "email.opened" }, {});

    const next = jest.fn();
    verifyResendWebhookSignature(req, mockRes, next);

    expect(next).toHaveBeenCalledWith(); // still allowed through
  });
});
