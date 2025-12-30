import { Response, NextFunction } from "express";
import { AuthenticatedRequest } from "../types";
import { emailService } from "../services/email/email.service";
import { timelineService } from "../services/timeline.service";
import { catchAsync } from "../utils/catchAsync";
import { AppError } from "../utils/AppError";
import { CreateEmailDTO } from "../types/email.types";
import { z } from "zod";
import { prisma } from "../config/prisma";

// ===================================
// VALIDATION SCHEMAS
// ===================================

const sendEmailSchema = z.object({
  to: z.array(z.string().email()).or(
    z
      .string()
      .email()
      .transform((email) => [email])
  ),
  cc: z.array(z.string().email()).optional(),
  bcc: z.array(z.string().email()).optional(),
  subject: z.string().min(1, "Subject is required"),
  bodyHtml: z.string().min(1, "Email body is required"),
  bodyText: z.string().optional(),
  replyTo: z.string().email().optional(),
  contactId: z.string().optional(),
  ticketId: z.string().optional(),
  enableTracking: z.boolean().optional(),
});

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

    // Validate input
    const validatedData = sendEmailSchema.parse(req.body);

    // 🔧 MULTI-TENANT FIX: Get company's corporate sender email
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: {
        defaultSenderEmail: true,
        defaultSenderName: true,
        smtpUser: true, // Fallback si no hay defaultSenderEmail
      },
    });

    if (!company) {
      return next(new AppError("Company not found", 404));
    }

    // Use company's configured sender email (CORPORATE EMAIL)
    // Priority: defaultSenderEmail > smtpUser > system fallback
    const fromEmail =
      company.defaultSenderEmail ||
      company.smtpUser ||
      process.env.DEFAULT_SENDER_EMAIL ||
      "noreply@replycrm.com";

    const fromName =
      company.defaultSenderName ||
      company.smtpUser?.split("@")[0] ||
      "Reply CRM";

    const dto: CreateEmailDTO = {
      companyId,
      from: `${fromName} <${fromEmail}>`, // Format: "Company Name <email@company.com>"
      to: Array.isArray(validatedData.to)
        ? validatedData.to
        : [validatedData.to],
      cc: validatedData.cc,
      bcc: validatedData.bcc,
      subject: validatedData.subject,
      bodyHtml: validatedData.bodyHtml,
      bodyText: validatedData.bodyText,
      replyTo: validatedData.replyTo || fromEmail, // Reply to company email
      contactId: validatedData.contactId,
      ticketId: validatedData.ticketId,
      enableTracking: validatedData.enableTracking ?? true,
    };

    const email = await emailService.sendEmail(dto);

    res.status(201).json({
      status: "success",
      data: { email },
    });
  }
);

/**
 * Receive incoming email webhook (e.g., from SendGrid, Mailgun)
 * POST /api/emails/webhook
 */
export const receiveWebhook = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const body = req.body;
    const headers = req.headers;

    // Process webhook (update email status or save inbound email)
    await emailService.processWebhook(body, headers);

    // Respond immediately (webhooks should be fast)
    res.status(200).json({
      status: "success",
      message: "Webhook processed",
    });
  }
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
  }
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
  }
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
  }
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
  }
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
      req.body;

    if (!host || !user || !toEmail) {
      return next(
        new AppError("Missing required SMTP fields or recipient email", 400)
      );
    }

    // Intelligent Security Configuration
    // Port 465 -> Requires Implicit SSL (secure: true)
    // Port 587 -> Requires STARTTLS (secure: false)
    let useSecure = secure;
    const portNum = parseInt(port);
    if (portNum === 587) useSecure = false;
    if (portNum === 465) useSecure = true;

    // Attempt to verify connection using a temporary Nodemailer Provider
    try {
      const {
        NodemailerProvider,
      } = require("../services/email/email.provider");
      const tempProvider = new NodemailerProvider({
        host,
        port: portNum,
        secure: useSecure,
        user,

        pass: password,
      });

      // Send Test Email
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
                        Seguro: ${secure ? "Sí" : "No"}
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
    } catch (error: any) {
      return next(
        new AppError(`Fallo al conectar o enviar: ${error.message}`, 400)
      );
    }
  }
);
