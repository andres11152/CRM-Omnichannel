import { Response, NextFunction } from "express";
import { AuthenticatedRequest } from "../types";
import { catchAsync } from "../utils/catchAsync";
import { AppError } from "../utils/AppError";
import { companySettingsService } from "../services/CompanySettingsService";

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

    const data = await companySettingsService.getEmailConfigStatus(companyId);

    res.status(200).json({
      status: "success",
      data,
    });
  },
);
