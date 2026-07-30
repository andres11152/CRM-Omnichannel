import { Request, Response } from "express";
import { catchAsync } from "@/utils/catchAsync";
import { TenantContextManager } from "@/config/tenantContext";
import { contactRepository } from "@/repositories/ContactRepository";
import { verifyUnsubscribeToken } from "@/utils/unsubscribeToken";
import { Logger } from "@/utils/logger";

const confirmationPage = (message: string, ok: boolean) => `<!doctype html>
<html lang="es"><head><meta charset="utf-8" /><title>Preferencias de Email</title>
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
  body { font-family: -apple-system, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #f8fafc; color: #1e293b; }
  .card { max-width: 420px; padding: 2.5rem; text-align: center; background: white; border-radius: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
  h1 { font-size: 1.25rem; margin: 0 0 0.5rem; }
  p { color: #64748b; font-size: 0.9rem; }
  .icon { font-size: 2.5rem; margin-bottom: 1rem; }
</style></head>
<body><div class="card">
  <div class="icon">${ok ? "✓" : "⚠"}</div>
  <h1>${ok ? "Preferencia actualizada" : "No se pudo procesar"}</h1>
  <p>${message}</p>
</div></body></html>`;

/**
 * GET /public/email/unsubscribe/:companyId/:contactId/:token
 * CAN-SPAM/GDPR-required one-click unsubscribe. No auth (it's a link
 * clicked from an email client) — the HMAC token is what makes it safe.
 */
export const unsubscribeContact = catchAsync(async (req: Request, res: Response) => {
  const { companyId, contactId, token } = req.params;

  if (!verifyUnsubscribeToken(companyId, contactId, token)) {
    Logger.warn(`[Unsubscribe] Invalid token for contact ${contactId}`);
    res.status(403).send(confirmationPage("Este enlace no es válido.", false));
    return;
  }

  const updated = await TenantContextManager.run(
    { companyId, userId: "public-unsubscribe", role: "SYSTEM", requestId: `unsub-${contactId}` },
    () =>
      contactRepository.update(companyId, contactId, {
        emailOptOut: true,
        emailOptOutAt: new Date(),
      }),
  ).catch(() => null);

  if (!updated) {
    res.status(404).send(confirmationPage("No encontramos este contacto.", false));
    return;
  }

  res
    .status(200)
    .send(confirmationPage("Ya no recibirás más correos de campañas de esta empresa.", true));
});
