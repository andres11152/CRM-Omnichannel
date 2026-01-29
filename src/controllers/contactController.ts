import { Request, Response } from "express";
import { catchAsync } from "@/utils/catchAsync";
import { AppError } from "@/utils/AppError";
import { HTTP_STATUS } from "@/constants/httpStatus";
import { contactService } from "@/services/contactService";
import { planLimitsService } from "@/services/planLimitsService";
import { prisma } from "@/config/database";

export const contactController = {
  // Create or Update a contact based on ID, phone or email
  upsertContact: catchAsync(async (req: Request, res: Response) => {
    const companyId = (req as any).companyId;
    const contact = await contactService.upsert(companyId, req.body);
    res.status(HTTP_STATUS.OK).json(contact);
  }),

  getContacts: catchAsync(async (req: Request, res: Response) => {
    const companyId = (req as any).companyId;
    const query = {
      search: req.query.search as string,
      page: Number(req.query.page) || 1,
      limit: Number(req.query.limit) || 100,
    };

    const result = await contactService.findAll(companyId, query);
    res.status(HTTP_STATUS.OK).json(result.data); // Maintaining API contract (array response expected by generic components usually, but ideally should return {data, meta})
    // NOTE: If frontend expects array directly, returning result.data. The service returns { data, meta }.
    // Examining original controller: it returned `contacts` array directly.
    // I will return `result.data`.
  }),

  getContactDetail: catchAsync(async (req: Request, res: Response) => {
    const companyId = (req as any).companyId;
    const { id, phone } = req.query;

    const contact = await contactService.findOne(companyId, {
      id: id as string,
      phone: phone as string,
    });

    // Original controller returned null with 200 OK.
    if (!contact) return res.status(200).json(null);
    res.status(HTTP_STATUS.OK).json(contact);
  }),

  deleteContact: catchAsync(async (req: Request, res: Response) => {
    const { id } = req.params;
    const companyId = (req as any).companyId;

    await contactService.delete(companyId, id);
    res.status(HTTP_STATUS.OK).json({ status: "success" });
  }),

  getContactTimeline: catchAsync(async (req: Request, res: Response) => {
    const { id } = req.params;
    const companyId = (req as any).companyId;

    const result = await contactService.getTimeline(companyId, id);
    res.status(HTTP_STATUS.OK).json({
      status: "success",
      data: result,
    });
  }),

  importContacts: catchAsync(async (req: Request, res: Response) => {
    const companyId = (req as any).companyId;
    const file = (req as any).file as Express.Multer.File;

    if (!file) throw new AppError("No file uploaded", 400);

    const { parseFile, normalizeRows } =
      await import("../services/csvParserService");
    const { CreateContactSchema } = await import("../schemas/contact.schema");

    const { rows, totalRows } = parseFile(file);
    if (totalRows === 0) throw new AppError("File is empty", 400);

    const normalizedRows = normalizeRows(rows);
    const validContacts: any[] = [];
    const errors: string[] = [];
    const duplicates: string[] = [];
    const seenPhones = new Set<string>();
    const seenEmails = new Set<string>();

    for (let i = 0; i < normalizedRows.length; i++) {
      const rowNum = i + 2;
      const row = normalizedRows[i];
      try {
        const validated = await CreateContactSchema.shape.body.parseAsync(row);
        const phone = validated.phone?.replace(/\D/g, "");
        const email = validated.email?.toLowerCase();

        if (phone && seenPhones.has(phone)) {
          duplicates.push(`Row ${rowNum}: Duplicate phone ${validated.phone}`);
          continue;
        }
        if (email && seenEmails.has(email)) {
          duplicates.push(`Row ${rowNum}: Duplicate email ${validated.email}`);
          continue;
        }

        // Quick duplication check (Should ideally use service bulk check but keeping logic here for now)
        const exists = await prisma.contact.findFirst({
          where: {
            companyId,
            OR: [
              phone ? { phone: { endsWith: phone.slice(-10) } } : {},
              email ? { email } : {},
            ].filter((o) => Object.keys(o).length > 0),
          },
        });

        if (exists) {
          duplicates.push(`Row ${rowNum}: Duplicate in database`);
          continue;
        }

        if (phone) seenPhones.add(phone);
        if (email) seenEmails.add(email);

        validContacts.push({ ...validated, companyId });
      } catch (e: any) {
        errors.push(`Row ${rowNum}: ${e.message}`);
      }
    }

    const canCreate = await planLimitsService.canCreateResource(
      companyId,
      "contacts",
      validContacts.length,
    );
    if (!canCreate) throw new AppError("Plan limit exceeded", 403);

    if (validContacts.length > 0) {
      // Bulk create via transaction
      await prisma.$transaction(
        validContacts.map((c) => prisma.contact.create({ data: c })),
      );
    }

    res.status(HTTP_STATUS.OK).json({
      success: true,
      totalRows,
      imported: validContacts.length,
      duplicates: duplicates.length,
      invalid: errors.length,
      summary: {
        message: `${validContacts.length} contacts imported`,
        successRate:
          totalRows > 0
            ? ((validContacts.length / totalRows) * 100).toFixed(1) + "%"
            : "0%",
      },
    });
  }),
};
