/**
 * [EMAIL] ENTERPRISE EMAIL TEMPLATES
 *
 * Hand-built, email-client-safe HTML: ONE shared shell (`baseEmailLayout`) + per-type
 * builders so every transactional email has the SAME enterprise structure (brand header,
 * accent card, bulletproof buttons w/ MSO-VML fallback, audit footer, plaintext alt).
 * No external CSS, no web fonts, dark-mode tolerant. Targets Gmail, Outlook (desktop/web),
 * Apple Mail and mobile.
 */

const BRAND = {
  name: "Sentry CRM",
  primary: "#4f46e5", // indigo-600 (default accent)
  primaryDark: "#4338ca",
  ink: "#0f172a",
  body: "#334155",
  muted: "#64748b",
  border: "#e2e8f0",
  bg: "#f1f5f9",
  surface: "#ffffff",
  green: "#00a884",
  greenDark: "#017561",
  danger: "#dc2626",
  dangerDark: "#b91c1c",
  warnBg: "#fffbeb",
  warnBorder: "#fcd34d",
  warnInk: "#92400e",
};

const FONT = "'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

export const esc = (s: string): string =>
  String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string),
  );

const fmtDate = (d: Date): string =>
  d.toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Bogota" });

// ───────────────────────── Shared building blocks ─────────────────────────

/** Bulletproof CTA button (renders in Outlook via VML). */
export function emailButton(url: string, label: string, color = BRAND.primary, colorDark = BRAND.primaryDark): string {
  const u = esc(url);
  const l = esc(label);
  return `
    <!--[if mso]>
    <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${u}" style="height:50px;v-text-anchor:middle;width:300px;" arcsize="16%" strokecolor="${colorDark}" fillcolor="${color}">
      <w:anchorlock/><center style="color:#ffffff;font-family:${FONT};font-size:16px;font-weight:700;">${l}</center>
    </v:roundrect>
    <![endif]-->
    <!--[if !mso]><!-- -->
    <table role="presentation" class="btn" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">
      <tr><td align="center" style="border-radius:10px; background-color:${color};">
        <a href="${u}" target="_blank" style="display:inline-block; padding:15px 36px; font-family:${FONT}; font-size:16px; font-weight:700; color:#ffffff; border-radius:10px; background-color:${color};">${l}</a>
      </td></tr>
    </table>
    <!--<![endif]-->`;
}

/** Label/value detail table (e.g. login metadata). rows already escaped or trusted. */
export function emailInfoTable(rows: Array<[string, string]>): string {
  const body = rows
    .map(
      ([k, v]) => `
      <tr>
        <td style="padding:7px 0; font-family:${FONT}; font-size:14px; color:${BRAND.muted}; width:130px; vertical-align:top;"><strong>${esc(k)}</strong></td>
        <td style="padding:7px 0; font-family:${FONT}; font-size:14px; color:${BRAND.body};">${v}</td>
      </tr>`,
    )
    .join("");
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${BRAND.bg}; border:1px solid ${BRAND.border}; border-radius:12px;">
      <tr><td style="padding:20px 22px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${body}</table></td></tr>
    </table>`;
}

/** Colored callout box. tone: "warning" | "danger" | "muted". */
export function emailCallout(html: string, tone: "warning" | "danger" | "muted" = "muted"): string {
  const map = {
    warning: { bg: BRAND.warnBg, border: BRAND.warnBorder, ink: BRAND.warnInk },
    danger: { bg: "#fef2f2", border: "#fca5a5", ink: BRAND.dangerDark },
    muted: { bg: BRAND.bg, border: BRAND.border, ink: BRAND.body },
  }[tone];
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${map.bg}; border:1px solid ${map.border}; border-radius:12px;">
      <tr><td style="padding:16px 20px; font-family:${FONT}; font-size:13.5px; line-height:1.6; color:${map.ink};">${html}</td></tr>
    </table>`;
}

interface BaseLayoutParams {
  preheader: string;
  accent?: string;
  heading: string;
  /** Inner HTML between the heading and the footer (compose with the helpers above). */
  bodyHtml: string;
  requestedAt?: Date;
  requestIp?: string | null;
  supportEmail?: string;
}

/** The shared enterprise shell every transactional email uses. */
export function baseEmailLayout(p: BaseLayoutParams): string {
  const accent = p.accent || BRAND.primary;
  const when = fmtDate(p.requestedAt || new Date());
  const year = (p.requestedAt || new Date()).getFullYear();
  const support = p.supportEmail || "soporte@sentrycrm.cloud";
  const audit = p.requestIp
    ? `Registrado el ${esc(when)} desde la IP ${esc(p.requestIp)}.`
    : `Registrado el ${esc(when)}.`;

  return `<!DOCTYPE html>
<html lang="es" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <meta name="color-scheme" content="light dark" />
  <meta name="supported-color-schemes" content="light dark" />
  <title>${esc(p.heading)}</title>
  <!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
  <style>
    a{text-decoration:none}
    @media only screen and (max-width:600px){
      .container{width:100% !important}
      .px{padding-left:24px !important;padding-right:24px !important}
      .btn a{display:block !important}
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:${BRAND.bg};-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${esc(p.preheader)}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${BRAND.bg};">
    <tr><td align="center" style="padding:32px 16px;">
      <table role="presentation" class="container" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;">

        <tr><td align="center" style="padding:8px 0 24px 0;">
          <span style="font-family:${FONT};font-size:20px;font-weight:700;letter-spacing:.3px;color:${BRAND.ink};">
            <span style="color:${accent};">●</span>&nbsp;${BRAND.name}
          </span>
        </td></tr>

        <tr><td style="background-color:${BRAND.surface};border:1px solid ${BRAND.border};border-radius:16px;overflow:hidden;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr><td style="height:5px;line-height:5px;font-size:5px;background-color:${accent};">&nbsp;</td></tr>
          </table>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr><td class="px" style="padding:40px 48px 0 48px;font-family:${FONT};">
              <h1 style="margin:0 0 16px 0;font-size:24px;line-height:1.3;font-weight:700;color:${BRAND.ink};">${esc(p.heading)}</h1>
            </td></tr>
            <tr><td class="px" style="padding:0 48px 8px 48px;font-family:${FONT};">${p.bodyHtml}</td></tr>
            <tr><td class="px" style="padding:24px 48px 0 48px;"><div style="height:1px;line-height:1px;font-size:1px;background-color:${BRAND.border};">&nbsp;</div></td></tr>
            <tr><td class="px" style="padding:16px 48px 36px 48px;font-family:${FONT};">
              <p style="margin:0;font-size:12px;line-height:1.6;color:${BRAND.muted};">${audit}</p>
            </td></tr>
          </table>
        </td></tr>

        <tr><td align="center" style="padding:24px 24px 8px 24px;font-family:${FONT};">
          <p style="margin:0 0 4px 0;font-size:12px;line-height:1.6;color:${BRAND.muted};">
            ¿Necesitas ayuda? Escríbenos a <a href="mailto:${esc(support)}" style="color:${accent};text-decoration:none;">${esc(support)}</a>
          </p>
          <p style="margin:0;font-size:12px;line-height:1.6;color:${BRAND.muted};">
            © ${year} ${BRAND.name}. Mensaje automático, por favor no respondas a este correo.
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

const p = (html: string, size = 16, color = BRAND.body): string =>
  `<p style="margin:0 0 14px 0;font-family:${FONT};font-size:${size}px;line-height:1.6;color:${color};">${html}</p>`;

// ───────────────────────── 1) Password reset ─────────────────────────

export interface PasswordResetEmailParams {
  resetUrl: string;
  userName?: string | null;
  expiryMinutes?: number;
  requestIp?: string | null;
  requestedAt?: Date;
  supportEmail?: string;
}

export function passwordResetEmail(params: PasswordResetEmailParams): { html: string; text: string } {
  const { resetUrl, userName, expiryMinutes = 10, requestIp, requestedAt = new Date(), supportEmail } = params;
  const greet = userName && !/^\+?\d[\d\s-]*$/.test(userName) ? `Hola ${esc(userName)},` : "Hola,";
  const safeUrl = esc(resetUrl);

  const bodyHtml = `
    ${p(greet)}
    ${p(`Recibimos una solicitud para restablecer la contraseña de tu cuenta en <strong>${BRAND.name}</strong>. Haz clic en el botón para crear una nueva contraseña.`)}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="padding:18px 0 14px 0;">${emailButton(resetUrl, "Restablecer contraseña")}</td></tr></table>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="padding:0 0 18px 0;">
      <span style="display:inline-block;padding:6px 14px;background-color:${BRAND.bg};border:1px solid ${BRAND.border};border-radius:999px;font-family:${FONT};font-size:13px;color:${BRAND.muted};">⏱&nbsp; Caduca en <strong style="color:${BRAND.body};">${expiryMinutes} minutos</strong> · un solo uso</span>
    </td></tr></table>
    ${p(`¿El botón no funciona? Copia y pega este enlace:`, 13, BRAND.muted)}
    <p style="margin:0 0 16px 0;font-family:${FONT};font-size:13px;line-height:1.6;word-break:break-all;"><a href="${safeUrl}" style="color:${BRAND.primary};text-decoration:underline;">${safeUrl}</a></p>
    ${emailCallout(`<strong style="color:${BRAND.ink};">¿No solicitaste esto?</strong> Ignora este correo: tu contraseña actual seguirá siendo válida y nadie podrá acceder con este mensaje. Nunca compartas este enlace.`, "muted")}
  `;

  const html = baseEmailLayout({
    preheader: `Restablece tu contraseña de ${BRAND.name}. El enlace caduca en ${expiryMinutes} minutos.`,
    heading: "Restablecer tu contraseña",
    bodyHtml,
    requestedAt,
    requestIp,
    supportEmail,
  });

  const text = [
    `${BRAND.name} — Restablecer tu contraseña`, "", greet.replace(/<[^>]+>/g, ""), "",
    `Solicitud de restablecimiento de contraseña. Abre este enlace (caduca en ${expiryMinutes} min, un solo uso):`, "",
    resetUrl, "",
    "Si no lo solicitaste, ignora este correo; tu contraseña actual sigue válida.",
  ].join("\n");

  return { html, text };
}

// ───────────────────────── 2) Login / new sign-in alert ─────────────────────────

export interface LoginAlertEmailParams {
  userName?: string | null;
  ipAddress: string;
  device: string;
  browser: string;
  location?: string | null;
  when: string; // pre-formatted date string
  confirmUrl: string;
  reportUrl: string;
  requestedAt?: Date;
  supportEmail?: string;
}

export function loginAlertEmail(params: LoginAlertEmailParams): { html: string; text: string } {
  const { userName, ipAddress, device, browser, location, when, confirmUrl, reportUrl, requestedAt = new Date(), supportEmail } = params;
  const greet = userName && !/^\+?\d[\d\s-]*$/.test(userName) ? `Hola ${esc(userName)},` : "Hola,";

  const rows: Array<[string, string]> = [
    ["Fecha y hora", esc(when)],
    ["Dirección IP", `<span style="font-family:monospace;">${esc(ipAddress)}</span>`],
    ["Dispositivo", esc(device)],
    ["Navegador", esc(browser)],
  ];
  if (location) rows.push(["Ubicación", esc(location)]);

  const bodyHtml = `
    ${p(greet)}
    ${p(`Detectamos un nuevo inicio de sesión en tu cuenta de <strong>${BRAND.name}</strong>. Si fuiste tú, no necesitas hacer nada. Si no reconoces esta actividad, asegura tu cuenta de inmediato.`)}
    ${emailInfoTable(rows)}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding:22px 0 8px 0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
        <td width="50%" style="padding-right:6px;">${emailButton(confirmUrl, "Sí, fui yo", BRAND.green, BRAND.greenDark)}</td>
        <td width="50%" style="padding-left:6px;">${emailButton(reportUrl, "No reconozco esto", BRAND.danger, BRAND.dangerDark)}</td>
      </tr></table>
    </td></tr></table>
    ${emailCallout(`<strong>Consejos de seguridad:</strong> usa contraseñas únicas, no las compartas con nadie y revisa periódicamente la actividad de tu cuenta.`, "warning")}
  `;

  const html = baseEmailLayout({
    preheader: `Nuevo inicio de sesión en ${BRAND.name} — ${when}`,
    accent: BRAND.green,
    heading: "Nuevo inicio de sesión",
    bodyHtml,
    requestedAt,
    requestIp: ipAddress,
    supportEmail,
  });

  const text = [
    `${BRAND.name} — Nuevo inicio de sesión`, "", greet.replace(/<[^>]+>/g, ""), "",
    "Detectamos un nuevo inicio de sesión en tu cuenta:",
    `  Fecha y hora: ${when}`, `  IP: ${ipAddress}`, `  Dispositivo: ${device}`, `  Navegador: ${browser}`,
    ...(location ? [`  Ubicación: ${location}`] : []), "",
    `Si fuiste tú, ignora este correo. Si no, repórtalo: ${reportUrl}`,
  ].join("\n");

  return { html, text };
}

// ───────────────────────── 3) WhatsApp disconnected alert ─────────────────────────

export interface WhatsAppDisconnectedEmailParams {
  adminName?: string | null;
  reason: string;
  reconnectUrl: string;
  requestedAt?: Date;
  supportEmail?: string;
}

export function whatsappDisconnectedEmail(params: WhatsAppDisconnectedEmailParams): { html: string; text: string } {
  const { adminName, reason, reconnectUrl, requestedAt = new Date(), supportEmail } = params;
  const greet = adminName && !/^\+?\d[\d\s-]*$/.test(adminName) ? `Hola ${esc(adminName)},` : "Hola,";

  const bodyHtml = `
    ${p(greet)}
    ${p(`Detectamos que la conexión de <strong>WhatsApp</strong> de tu cuenta en ${BRAND.name} se cerró inesperadamente. Mientras esté desconectada, <strong>no entrarán ni saldrán mensajes</strong>.`)}
    ${emailCallout(`<strong>Motivo reportado:</strong> ${esc(reason)}`, "danger")}
    ${p(`Vuelve a vincular tu dispositivo escaneando el código QR en la configuración.`)}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="padding:18px 0 8px 0;">${emailButton(reconnectUrl, "Reconectar WhatsApp", BRAND.danger, BRAND.dangerDark)}</td></tr></table>
  `;

  const html = baseEmailLayout({
    preheader: `WhatsApp se desconectó en ${BRAND.name}. Reconecta para no perder mensajes.`,
    accent: BRAND.danger,
    heading: "WhatsApp se desconectó",
    bodyHtml,
    requestedAt,
    supportEmail,
  });

  const text = [
    `${BRAND.name} — WhatsApp se desconectó`, "", greet.replace(/<[^>]+>/g, ""), "",
    "La conexión de WhatsApp se cerró. No entrarán ni saldrán mensajes hasta reconectar.",
    `Motivo: ${reason}`, "",
    `Reconecta aquí: ${reconnectUrl}`,
  ].join("\n");

  return { html, text };
}
