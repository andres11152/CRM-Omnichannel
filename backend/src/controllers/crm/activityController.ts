import { Response, NextFunction } from "express";
import { AppError } from "../../utils/AppError";
import { catchAsync } from "../../utils/catchAsync";
import { AuthenticatedRequest } from "../../types";
import { activityService } from "../../services/ActivityService";

// Get activities
export const getActivities = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const companyId = req.user?.companyId;
    const { dealId, accountId, contactId, type } = req.query;

    if (!companyId) {
      return next(new AppError("Company ID is missing", 400));
    }

    const activities = await activityService.getActivities({
      companyId,
      dealId: dealId as string | undefined,
      accountId: accountId as string | undefined,
      contactId: contactId as string | undefined,
      type: type as string | undefined,
    });

    res.status(200).json({
      status: "success",
      results: activities.length,
      data: { activities },
    });
  },
);

// Create activity
export const createActivity = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const companyId = req.user?.companyId;
    const userId = req.user?.id;

    if (!companyId || !userId) {
      return next(new AppError("Company ID or User ID is missing", 400));
    }

    const activity = await activityService.createActivity({
      companyId,
      userId,
      subject: req.body.subject,
      ...req.body,
    });

    res.status(201).json({
      status: "success",
      data: { activity },
    });
  },
);

// Update activity
export const updateActivity = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const { id } = req.params;
    const companyId = req.user?.companyId;

    if (!companyId) {
      return next(new AppError("Company ID is missing", 400));
    }

    const updatedActivity = await activityService.updateActivity({
      id,
      companyId,
      ...req.body,
    });

    res.status(200).json({
      status: "success",
      data: { activity: updatedActivity },
    });
  },
);

// Delete activity
export const deleteActivity = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const { id } = req.params;
    const companyId = req.user?.companyId;

    if (!companyId) {
      return next(new AppError("Company ID is missing", 400));
    }

    await activityService.deleteActivity(id, companyId);

    res.status(204).json({
      status: "success",
      data: null,
    });
  },
);
