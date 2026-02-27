import { Request, Response } from "express";
import { catchAsync } from "@/utils/catchAsync";
import { AppError } from "@/utils/AppError";
import { HTTP_STATUS } from "@/constants/httpStatus";
import { contactService } from "@/services/contactService";
import { planLimitsService } from "@/services/planLimitsService";
import { AuthenticatedRequest } from "@/types/types";

export const contactController = {
  upsertContact: catchAsync(async (req: Request, res: Response) => {
    const companyId = (req as AuthenticatedRequest).companyId;
    const contact = await contactService.upsert(companyId!, req.body);
    res.status(HTTP_STATUS.OK).json(contact);
  }),

  getContacts: catchAsync(async (req: Request, res: Response) => {
    const companyId = (req as AuthenticatedRequest).companyId;
    const query = {
      search: req.query.search as string,
      page: Number(req.query.page) || 1,
      limit: Number(req.query.limit) || 100,
    };

    const result = await contactService.findAll(companyId!, query);
    res.status(HTTP_STATUS.OK).json(result.data);
  }),

  getContactDetail: catchAsync(async (req: Request, res: Response) => {
    const companyId = (req as AuthenticatedRequest).companyId;
    const { id, phone } = req.query;

    const contact = await contactService.findOne(companyId!, {
      id: id as string,
      phone: phone as string,
    });

    if (!contact) return res.status(200).json(null);
    res.status(HTTP_STATUS.OK).json(contact);
  }),

  deleteContact: catchAsync(async (req: Request, res: Response) => {
    const { id } = req.params;
    const companyId = (req as AuthenticatedRequest).companyId;

    await contactService.delete(companyId!, id);
    res.status(HTTP_STATUS.OK).json({ status: "success" });
  }),

  getContactTimeline: catchAsync(async (req: Request, res: Response) => {
    const { id } = req.params;
    const companyId = (req as AuthenticatedRequest).companyId;

    const result = await contactService.getTimeline(companyId!, id);
    res.status(HTTP_STATUS.OK).json({
      status: "success",
      data: result,
    });
  }),

  importContacts: catchAsync(async (req: Request, res: Response) => {
    const companyId = (req as AuthenticatedRequest).companyId!;
    const file = (req as AuthenticatedRequest & { file?: Express.Multer.File })
      .file;

    if (!file) throw new AppError("No file uploaded", 400);

    const { parseFile, normalizeRows } =
      await import("../services/csvParserService");
    const { CreateContactSchema } = await import("../schemas/contactSchema");

    const { rows, totalRows } = parseFile(file);
    if (totalRows === 0) throw new AppError("File is empty", 400);

    const normalizedRows = normalizeRows(rows);
    const validContacts: Record<string, unknown>[] = [];
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

        const isDuplicate = await contactService.checkDuplicate(
          companyId,
          phone,
          email,
        );

        if (isDuplicate) {
          duplicates.push(`Row ${rowNum}: Duplicate in database`);
          continue;
        }

        if (phone) seenPhones.add(phone);
        if (email) seenEmails.add(email);

        validContacts.push({ ...validated, companyId });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Validation error";
        errors.push(`Row ${rowNum}: ${msg}`);
      }
    }

    const canCreate = await planLimitsService.canCreateResource(
      companyId,
      "contacts",
      validContacts.length,
    );
    if (!canCreate) throw new AppError("Plan limit exceeded", 403);

    await contactService.bulkCreate(validContacts);

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

