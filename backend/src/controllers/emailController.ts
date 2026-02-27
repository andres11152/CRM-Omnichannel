import { Response, NextFunction } from "express";
import { AuthenticatedRequest } from "../types";
import { emailService } from "../services/email/emailService";
import { timelineService } from "../services/timelineService";
import { catchAsync } from "../utils/catchAsync";
import { AppError } from "../utils/AppError";
import { CreateEmailDTO } from "../types/email.types";
import { companySettingsService } from "../services/companySettingsService";
import {
  sendEmailSchema,
  testEmailConnectionSchema,
} from "../schemas/emailSchema";
import { EmailProviderFactory } from "../services/email/email.provider";

// ===================================

// CONTROLLERS
// ===================================

/**
 * Send an email
 * POST /api/emails/send
 */
export const sendEmail = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const companyId = req.user?.companyId;

    if (!companyId) {
      return next(new AppError("Company ID is missing", 400));
    }

    const validatedData = sendEmailSchema.parse(req.body);

    const { fromEmail, fromName } =
      await companySettingsService.getSenderConfig(companyId);

    const dto: CreateEmailDTO = {
      companyId,
      from: `${fromName} <${fromEmail}>`,
      to: validatedData.to,
      cc: validatedData.cc,
      bcc: validatedData.bcc,
      subject: validatedData.subject,
      bodyHtml: validatedData.bodyHtml,
      bodyText: validatedData.bodyText,
      replyTo: validatedData.replyTo || fromEmail,
      contactId: validatedData.contactId,
      ticketId: validatedData.ticketId,
      enableTracking: validatedData.enableTracking ?? true,
    };

    const email = await emailService.sendEmail(dto);

    res.status(201).json({
      status: "success",
      data: { email },
    });
  },
);

/**
 * Receive incoming email webhook
 * POST /api/emails/webhook
 */
export const receiveWebhook = catchAsync(
  async (req: AuthenticatedRequest, res: Response, _next: NextFunction) => {
    await emailService.processWebhook(req.body, req.headers);

    res.status(200).json({
      status: "success",
      message: "Webhook processed",
    });
  },
);

/**
 * Get emails by contact
 * GET /api/emails/contact/:contactId
 */
export const getEmailsByContact = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const { contactId } = req.params;
    const companyId = req.user?.companyId;

    if (!companyId) {
      return next(new AppError("Company ID is missing", 400));
    }

    const emails = await emailService.getEmailsByContact(contactId, companyId);

    res.status(200).json({
      status: "success",
      results: emails.length,
      data: { emails },
    });
  },
);

/**
 * Get emails by ticket
 * GET /api/emails/ticket/:ticketId
 */
export const getEmailsByTicket = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const { ticketId } = req.params;
    const companyId = req.user?.companyId;

    if (!companyId) {
      return next(new AppError("Company ID is missing", 400));
    }

    const emails = await emailService.getEmailsByTicket(ticketId, companyId);

    res.status(200).json({
      status: "success",
      results: emails.length,
      data: { emails },
    });
  },
);

/**
 * Get unified timeline (WhatsApp + Email)
 * GET /api/timeline?contactId=xxx&ticketId=yyy
 */
export const getTimeline = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const companyId = req.user?.companyId;

    if (!companyId) {
      return next(new AppError("Company ID is missing", 400));
    }

    const { contactId, ticketId, limit, offset } = req.query;

    const timeline = await timelineService.getTimeline({
      companyId,
      contactId: contactId as string | undefined,
      ticketId: ticketId as string | undefined,
      limit: limit ? parseInt(limit as string) : 100,
      offset: offset ? parseInt(offset as string) : 0,
    });

    res.status(200).json({
      status: "success",
      results: timeline.length,
      data: { timeline },
    });
  },
);

/**
 * Get timeline stats
 * GET /api/timeline/:contactId/stats
 */
export const getTimelineStats = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const { contactId } = req.params;
    const companyId = req.user?.companyId;

    if (!companyId) {
      return next(new AppError("Company ID is missing", 400));
    }

    const stats = await timelineService.getTimelineStats(contactId, companyId);

    res.status(200).json({
      status: "success",
      data: { stats },
    });
  },
);

/**
 * Test SMTP Connection and Send Test Email
 * POST /api/emails/test-connection
 */
export const testEmailConnection = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const companyId = req.user?.companyId;

    if (!companyId) {
      return next(new AppError("Company ID is missing", 400));
    }

    const { host, port, user, password, secure, toEmail, senderEmail } =
      testEmailConnectionSchema.parse(req.body);

    if (!host || !user || !toEmail) {
      return next(
        new AppError("Missing required SMTP fields or recipient email", 400),
      );
    }

    let useSecure = secure;
    if (port === 587) useSecure = false;
    if (port === 465) useSecure = true;

    try {
      const tempProvider = EmailProviderFactory.createProvider("nodemailer", {
        host,
        port,
        secure: useSecure,
        user,
        pass: password,
      });

      const result = await tempProvider.sendEmail({
        from: senderEmail || user,
        to: [toEmail],
        subject: "Prueba de Conexión SMTP - Reply CRM",
        htmlBody: `
                <div style="font-family: sans-serif; padding: 20px; border: 1px solid #eee; border-radius: 8px;">
                    <h2 style="color: #4F46E5;">¡Conexión Exitosa! 🎉</h2>
                    <p>Hola,</p>
                    <p>Si estás leyendo esto, significa que tu configuración SMTP en <strong>Reply CRM</strong> es correcta.</p>
                    <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
                    <p style="color: #666; font-size: 12px;">
                        <strong>Configuración Probada:</strong><br>
                        Host: ${host}<br>
                        Usuario: ${user}<br>
                        Puerto: ${port}<br>
                        Seguro: ${useSecure ? "Sí" : "No"}
                    </p>
                </div>
            `,
        textBody:
          "¡Conexión Exitosa! Si estás leyendo esto, significa que tu configuración SMTP en Reply CRM es correcta.",
      });

      if (!result.success) {
        throw new Error(result.error || "Unknown error during sending");
      }

      res.status(200).json({
        status: "success",
        message: "Conexión verificada y correo de prueba enviado exitosamente.",
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown SMTP error";
      return next(
        new AppError(`Fallo al conectar o enviar: ${errorMessage}`, 400),
      );
    }
  },
);

