import { Response, NextFunction } from "express";
import { AppError } from "../../utils/AppError";
import { catchAsync } from "../../utils/catchAsync";
import { AuthenticatedRequest } from "../../types";
import { prisma } from "../../config/prisma";

const resolveContactId = async (id: string, companyId: string) => {
  if (!id) return undefined;

  // 1. Check if it's already a Contact
  const contact = await prisma.contact.findUnique({ where: { id } });
  if (contact) return id;

  // 2. Check if it's a User
  const user = await prisma.user.findUnique({ where: { id } });
  if (user) {
    // Find or Create Contact for this User
    let linkedContact = await prisma.contact.findFirst({
      where: {
        companyId,
        OR: [{ email: user.email }, { phone: user.email.replace("@c.us", "") }],
      },
    });

    if (!linkedContact) {
      linkedContact = await prisma.contact.create({
        data: {
          companyId,
          name: user.name || "Usuario Chat",
          email: user.email.includes("@") ? user.email : null,
          phone: !user.email.includes("@") ? user.email : null,
          tags: ["Auto-creado desde Notas"],
        },
      });
    }
    return linkedContact.id;
  }

  return undefined;
};

// Get activities
export const getActivities = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const companyId = req.user?.companyId;
    const { dealId, accountId, contactId, type } = req.query;

    if (!companyId) {
      return next(new AppError("Company ID is missing", 400));
    }

    const where: any = { companyId };
    if (dealId) where.dealId = dealId;
    if (accountId) where.accountId = accountId;

    if (contactId) {
      const resolvedId = await resolveContactId(contactId as string, companyId);
      if (resolvedId) where.contactId = resolvedId;
      else where.contactId = contactId; // Fallback to original if resolution fails (likely 0 results)
    }

    if (type) where.type = type;

    const activities = await prisma.activity.findMany({
      where,
      include: {
        createdBy: { select: { name: true, email: true } },
        assignedTo: { select: { name: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    res.status(200).json({
      status: "success",
      results: activities.length,
      data: { activities },
    });
  }
);

// Create activity
export const createActivity = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const companyId = req.user?.companyId;
    const userId = req.user?.id;
    const {
      type,
      subject,
      description,
      status,
      dueDate,
      accountId,
      dealId,
      contactId,
      assignedToId,
    } = req.body;

    if (!companyId || !userId) {
      return next(new AppError("Company ID or User ID is missing", 400));
    }

    const activity = await prisma.activity.create({
      data: {
        companyId,
        createdById: userId,
        type: type || "NOTE",
        subject,
        description,
        status: status || "PENDING",
        dueDate: dueDate ? new Date(dueDate) : null,
        accountId: accountId && accountId !== "" ? accountId : undefined,
        dealId: dealId && dealId !== "" ? dealId : undefined,
        contactId:
          contactId && contactId !== ""
            ? await resolveContactId(contactId, companyId)
            : undefined,
        assignedToId:
          assignedToId && assignedToId !== "" ? assignedToId : undefined,
      },
    });

    res.status(201).json({
      status: "success",
      data: { activity },
    });
  }
);

// Update activity
export const updateActivity = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const { id } = req.params;
    const companyId = req.user?.companyId;

    const activity = await prisma.activity.findFirst({
      where: { id, companyId },
    });

    if (!activity) {
      return next(new AppError("Activity not found", 404));
    }

    // Sanitize update data
    const updateData = { ...req.body };
    if (updateData.accountId === "") updateData.accountId = null;
    if (updateData.dealId === "") updateData.dealId = null;
    if (updateData.contactId === "") updateData.contactId = null;
    if (updateData.assignedToId === "") updateData.assignedToId = null;
    if (updateData.dueDate) updateData.dueDate = new Date(updateData.dueDate);

    const updatedActivity = await prisma.activity.update({
      where: { id },
      data: updateData,
    });

    res.status(200).json({
      status: "success",
      data: { activity: updatedActivity },
    });
  }
);

// Delete activity
export const deleteActivity = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const { id } = req.params;
    const companyId = req.user?.companyId;

    const activity = await prisma.activity.findFirst({
      where: { id, companyId },
    });

    if (!activity) {
      return next(new AppError("Activity not found", 404));
    }

    await prisma.activity.delete({ where: { id } });

    res.status(204).json({
      status: "success",
      data: null,
    });
  }
);
