import { Request, Response } from "express";
import { catchAsync } from "@/utils/catchAsync";
import { prisma } from "@/config/prisma";
import { AppError } from "@/utils/AppError";
import { HTTP_STATUS } from "@/constants/httpStatus";

export const contactController = {
  createContact: catchAsync(async (req: Request, res: Response) => {
    const companyId = (req as any).companyId;
    const { name, email, phone, avatarUrl, tags, notes, customFields } =
      req.body;

    if (!name) {
      throw new AppError("Name is required", HTTP_STATUS.BAD_REQUEST);
    }

    // Use raw query to avoid Prisma schema sync issues
    const id = `c-${Date.now()}`;
    const now = new Date().toISOString();

    // Simple raw insert for robustness
    await prisma.$executeRaw`
      INSERT INTO "contacts" ("id", "companyId", "name", "email", "phone", "avatarUrl", "tags", "notes", "customFields", "createdAt", "updatedAt")
      VALUES (${id}, ${companyId}, ${name}, ${email || null}, ${
      phone || null
    }, ${avatarUrl || null}, ${tags || []}, ${notes || null}, ${
      customFields ? JSON.stringify(customFields) : null
    }::jsonb, ${now}::timestamp, ${now}::timestamp)
    `;

    const newContact = {
      id,
      companyId,
      name,
      email,
      phone,
      avatarUrl,
      tags: tags || [],
      notes,
      customFields,
      createdAt: now,
      updatedAt: now,
    };

    res.status(HTTP_STATUS.CREATED).json(newContact);
  }),

  getContacts: catchAsync(async (req: Request, res: Response) => {
    const companyId = (req as any).companyId;

    // Raw query
    const contacts = await prisma.$queryRaw`
      SELECT * FROM "contacts" WHERE "companyId" = ${companyId} ORDER BY "createdAt" DESC
    `;

    res.status(HTTP_STATUS.OK).json(contacts);
  }),

  updateContact: catchAsync(async (req: Request, res: Response) => {
    const { id } = req.params;
    const companyId = (req as any).companyId;
    const { name, email, phone, tags, notes } = req.body;

    const now = new Date().toISOString();

    await prisma.$executeRaw`
        UPDATE "contacts" 
        SET "name" = ${name}, "email" = ${email}, "phone" = ${phone}, "tags" = ${tags}, "notes" = ${notes}, "updatedAt" = ${now}::timestamp
        WHERE "id" = ${id} AND "companyId" = ${companyId}
    `;

    res.status(HTTP_STATUS.OK).json({ status: "success" });
  }),

  deleteContact: catchAsync(async (req: Request, res: Response) => {
    const { id } = req.params;
    const companyId = (req as any).companyId;

    await prisma.$executeRaw`
        DELETE FROM "contacts" WHERE "id" = ${id} AND "companyId" = ${companyId}
    `;

    res.status(HTTP_STATUS.OK).json({ status: "success" });
  }),
};
