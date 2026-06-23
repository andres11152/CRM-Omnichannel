import { emailService } from "./EmailService";
import { loginAlertEmail } from "@/utils/emailTemplates";
import { Logger } from "@/utils/logger";

interface LoginNotificationData {
  userEmail: string;
  userName: string;
  ipAddress: string;
  userAgent: string;
  timestamp: Date;
  location?: string;
}

/**
 * Envía un email de notificación de seguridad después de un login exitoso.
 * Estándar de la industria para CRM/SaaS (similar a Google, AWS, etc.).
 * Usa la plantilla enterprise compartida (emailTemplates.loginAlertEmail).
 */
export async function sendLoginNotification(
  data: LoginNotificationData,
): Promise<void> {
  const { userEmail, userName, ipAddress, userAgent, timestamp, location } = data;

  const deviceInfo = parseUserAgent(userAgent);
  const formattedDate = new Intl.DateTimeFormat("es-CO", {
    dateStyle: "full",
    timeStyle: "long",
    timeZone: "America/Bogota",
  }).format(timestamp);

  const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
  const reportUrl = `${frontendUrl}/security/report-suspicious-activity`;

  const { html, text } = loginAlertEmail({
    userName,
    ipAddress,
    device: deviceInfo.device,
    browser: deviceInfo.browser,
    location,
    when: formattedDate,
    confirmUrl: frontendUrl,
    reportUrl,
    requestedAt: timestamp,
  });

  try {
    await emailService.sendEmail({
      to: userEmail,
      subject: `Nuevo inicio de sesión · Sentry CRM`,
      html,
      text,
    });
    Logger.info(`[LoginNotification] ✅ Security email sent to ${userEmail}`);
  } catch (error) {
    // No lanzamos error para no bloquear el login si el email falla
    Logger.error(
      `[LoginNotification] ❌ Failed to send security email to ${userEmail}:`,
      error instanceof Error ? error : new Error(String(error)),
    );
  }
}

/**
 * Parse simple del user-agent para extraer info del dispositivo
 */
function parseUserAgent(userAgent: string): {
  device: string;
  browser: string;
} {
  let device = "Desconocido";
  let browser = "Desconocido";

  if (!userAgent) {
    return { device, browser };
  }

  // Detect device
  if (/mobile/i.test(userAgent)) {
    device = "Móvil";
  } else if (/tablet|ipad/i.test(userAgent)) {
    device = "Tablet";
  } else {
    device = "Computadora";
  }

  // Detect browser
  if (/edg/i.test(userAgent)) {
    browser = "Microsoft Edge";
  } else if (/chrome/i.test(userAgent) && !/edg/i.test(userAgent)) {
    browser = "Google Chrome";
  } else if (/firefox/i.test(userAgent)) {
    browser = "Mozilla Firefox";
  } else if (/safari/i.test(userAgent) && !/chrome/i.test(userAgent)) {
    browser = "Safari";
  } else if (/opera|opr/i.test(userAgent)) {
    browser = "Opera";
  }

  // Detect OS
  let os = "";
  if (/windows/i.test(userAgent)) {
    os = " (Windows)";
  } else if (/mac/i.test(userAgent)) {
    os = " (macOS)";
  } else if (/linux/i.test(userAgent)) {
    os = " (Linux)";
  } else if (/android/i.test(userAgent)) {
    os = " (Android)";
  } else if (/ios|iphone|ipad/i.test(userAgent)) {
    os = " (iOS)";
  }

  return {
    device: device + os,
    browser,
  };
}
