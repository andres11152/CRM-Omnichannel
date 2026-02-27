import { emailService } from "./emailService";
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
 * Envía un email de notificación de seguridad después de un login exitoso
 * Estándar de la industria para CRM/SaaS (similar a Google, AWS, etc.)
 */
export async function sendLoginNotification(
  data: LoginNotificationData,
): Promise<void> {
  const { userEmail, userName, ipAddress, userAgent, timestamp, location } =
    data;

  // Parse user agent para obtener info del dispositivo
  const deviceInfo = parseUserAgent(userAgent);
  const formattedDate = new Intl.DateTimeFormat("es-CO", {
    dateStyle: "full",
    timeStyle: "long",
    timeZone: "America/Bogota",
  }).format(timestamp);

  const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
  const reportUrl = `${frontendUrl}/security/report-suspicious-activity`;

  const htmlContent = `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Nuevo Inicio de Sesión Detectado</title>
    </head>
    <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
      <table role="presentation" style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 40px 20px;">
            <table role="presentation" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
              
              <!-- Header -->
              <tr>
                <td style="background: linear-gradient(135deg, #00a884 0%, #005c4b 100%); padding: 40px 40px 30px; border-radius: 12px 12px 0 0; text-align: center;">
                  <h1 style="color: #ffffff; margin: 0 0 10px; font-size: 28px; font-weight: 600;">
                    🔐 Nuevo Inicio de Sesión
                  </h1>
                  <p style="color: rgba(255,255,255,0.9); margin: 0; font-size: 16px;">
                    Hemos detectado un acceso a tu cuenta
                  </p>
                </td>
              </tr>

              <!-- Content -->
              <tr>
                <td style="padding: 40px;">
                  <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 24px;">
                    Hola <strong>${userName}</strong>,
                  </p>
                  
                  <p style="color: #666666; font-size: 15px; line-height: 1.6; margin: 0 0 30px;">
                    Alguien acaba de iniciar sesión en tu cuenta de Reply CRM. Si fuiste tú, puedes ignorar este mensaje. Si no reconoces esta actividad, <strong>toma acción inmediata</strong>.
                  </p>

                  <!-- Info Box -->
                  <table role="presentation" style="width: 100%; background-color: #f8f9fa; border-radius: 8px; border-left: 4px solid #00a884;">
                    <tr>
                      <td style="padding: 24px;">
                        <h3 style="color: #333333; margin: 0 0 16px; font-size: 16px; font-weight: 600;">
                          📋 Detalles del Inicio de Sesión
                        </h3>
                        
                        <table role="presentation" style="width: 100%;">
                          <tr>
                            <td style="padding: 8px 0; color: #666666; font-size: 14px; width: 120px;">
                              <strong>Fecha y Hora:</strong>
                            </td>
                            <td style="padding: 8px 0; color: #333333; font-size: 14px;">
                              ${formattedDate}
                            </td>
                          </tr>
                          <tr>
                            <td style="padding: 8px 0; color: #666666; font-size: 14px;">
                              <strong>Dirección IP:</strong>
                            </td>
                            <td style="padding: 8px 0; color: #333333; font-size: 14px; font-family: monospace;">
                              ${ipAddress}
                            </td>
                          </tr>
                          <tr>
                            <td style="padding: 8px 0; color: #666666; font-size: 14px;">
                              <strong>Dispositivo:</strong>
                            </td>
                            <td style="padding: 8px 0; color: #333333; font-size: 14px;">
                              ${deviceInfo.device}
                            </td>
                          </tr>
                          <tr>
                            <td style="padding: 8px 0; color: #666666; font-size: 14px;">
                              <strong>Navegador:</strong>
                            </td>
                            <td style="padding: 8px 0; color: #333333; font-size: 14px;">
                              ${deviceInfo.browser}
                            </td>
                          </tr>
                          ${
                            location
                              ? `
                          <tr>
                            <td style="padding: 8px 0; color: #666666; font-size: 14px;">
                              <strong>Ubicación:</strong>
                            </td>
                            <td style="padding: 8px 0; color: #333333; font-size: 14px;">
                              ${location}
                            </td>
                          </tr>
                          `
                              : ""
                          }
                        </table>
                      </td>
                    </tr>
                  </table>

                  <!-- Action Buttons -->
                  <table role="presentation" style="width: 100%; margin-top: 30px;">
                    <tr>
                      <td style="padding: 0 0 12px;">
                        <p style="color: #333333; font-size: 15px; font-weight: 600; margin: 0 0 16px;">
                          ¿Fuiste tú?
                        </p>
                      </td>
                    </tr>
                    <tr>
                      <td>
                        <table role="presentation" style="border-collapse: separate; width: 100%;">
                          <tr>
                            <td style="padding-right: 8px; width: 50%;">
                              <a href="${frontendUrl}" style="display: block; padding: 14px 24px; background-color: #00a884; color: #ffffff; text-decoration: none; border-radius: 6px; text-align: center; font-weight: 600; font-size: 14px;">
                                ✅ Sí, fui yo
                              </a>
                            </td>
                            <td style="padding-left: 8px; width: 50%;">
                              <a href="${reportUrl}" style="display: block; padding: 14px 24px; background-color: #dc2626; color: #ffffff; text-decoration: none; border-radius: 6px; text-align: center; font-weight: 600; font-size: 14px;">
                                ⚠️ No fui yo
                              </a>
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                  </table>

                  <!-- Security Tips -->
                  <table role="presentation" style="width: 100%; margin-top: 30px; background-color: #fff3cd; border-radius: 8px; border: 1px solid #ffc107;">
                    <tr>
                      <td style="padding: 20px;">
                        <p style="color: #856404; font-size: 13px; margin: 0 0 10px; font-weight: 600;">
                          💡 Consejos de Seguridad:
                        </p>
                        <ul style="color: #856404; font-size: 13px; margin: 0; padding-left: 20px; line-height: 1.6;">
                          <li>Usa contraseñas únicas y seguras</li>
                          <li>Habilita autenticación de dos factores cuando esté disponible</li>
                          <li>No compartas tu contraseña con nadie</li>
                          <li>Revisa regularmente la actividad de tu cuenta</li>
                        </ul>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <!-- Footer -->
              <tr>
                <td style="background-color: #f8f9fa; padding: 24px 40px; border-radius: 0 0 12px 12px; text-align: center; border-top: 1px solid #e9ecef;">
                  <p style="color: #666666; font-size: 13px; margin: 0 0 8px;">
                    Este email fue enviado automáticamente por motivos de seguridad.
                  </p>
                  <p style="color: #999999; font-size: 12px; margin: 0;">
                    © ${new Date().getFullYear()} Reply CRM. Todos los derechos reservados.
                  </p>
                  <p style="color: #999999; font-size: 12px; margin: 12px 0 0;">
                    <a href="${frontendUrl}/privacy" style="color: #00a884; text-decoration: none;">Política de Privacidad</a> • 
                    <a href="${frontendUrl}/terms" style="color: #00a884; text-decoration: none;">Términos de Servicio</a>
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;

  try {
    await emailService.sendEmail({
      to: userEmail,
      subject: `🔐 Nuevo inicio de sesión en Reply CRM - ${
        formattedDate.split(",")[0]
      }`,
      html: htmlContent,
    });
    Logger.info(`[LoginNotification] ✅ Security email sent to ${userEmail}`);
  } catch (error) {
    // No lanzamos error para no bloquear el login si el email falla
    Logger.error(
      `[LoginNotification] ❌ Failed to send security email to ${userEmail}:`,
      error,
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
    device = "📱 Móvil";
  } else if (/tablet|ipad/i.test(userAgent)) {
    device = "📱 Tablet";
  } else {
    device = "💻 Computadora";
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
