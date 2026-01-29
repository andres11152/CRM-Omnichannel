import { Response, NextFunction } from "express";
import { AuthenticatedRequest } from "../types";
import { prisma } from "../config/database";
import { catchAsync } from "../utils/catchAsync";
import { AppError } from "../utils/AppError";

/**
 * Get company's email configuration
 * GET /api/company/email-config
 */
export const getEmailConfig = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const companyId = req.user?.companyId;

    if (!companyId) {
      return next(new AppError("Company ID is missing", 400));
    }

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: {
        defaultSenderEmail: true,
        defaultSenderName: true,
        smtpHost: true,
        smtpUser: true,
        emailProvider: true,
      },
    });

    if (!company) {
      return next(new AppError("Company not found", 404));
    }

    // Determine if email is configured
    const isConfigured = !!(
      company.defaultSenderEmail ||
      (company.smtpHost && company.smtpUser)
    );

    res.status(200).json({
      status: "success",
      data: {
        isConfigured,
        senderEmail: company.defaultSenderEmail || company.smtpUser || null,
        senderName:
          company.defaultSenderName || company.smtpUser?.split("@")[0] || null,
        provider: company.emailProvider,
      },
    });
  }
);
