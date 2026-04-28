import { Response } from "express";
import { catchAsync } from "@/utils/catchAsync";
import { AppError } from "@/utils/AppError";
import { HTTP_STATUS } from "@/constants/httpStatus";
import { contactService } from "@/services/ContactService";
import { planLimitsService } from "@/services/PlanLimitsService";
import { AuthenticatedRequest } from "@/types/types";
import { ParsedQs } from "qs";

export const contactController = {
  upsertContact: catchAsync(
    async (req: AuthenticatedRequest, res: Response) => {
      const companyId = req.companyId!;
      const contact = await contactService.upsert(companyId, req.body);
      res.status(HTTP_STATUS.OK).json({
        status: "success",
        data: contact,
      });
    },
  ),

  updateContact: catchAsync(
    async (req: AuthenticatedRequest, res: Response) => {
      const companyId = req.companyId!;
      const { id } = req.params;
      const contact = await contactService.update(companyId, id, req.body);
      res.status(HTTP_STATUS.OK).json({
        status: "success",
        data: contact,
      });
    },
  ),

  getContacts: catchAsync(async (req: AuthenticatedRequest, res: Response) => {
    const companyId = req.companyId!;
    const { search, limit, offset } = req.query as ParsedQs;

    const query = {
      search: search as string,
      page: Math.floor(Number(offset) / Number(limit)) + 1 || 1,
      limit: Number(limit) || 100,
    };

    const result = await contactService.findAll(companyId, query);
    res.status(HTTP_STATUS.OK).json({
      status: "success",
      data: result.data,
      meta: result.meta, // Standardized pagination meta
    });
  }),

  getContactDetail: catchAsync(
    async (req: AuthenticatedRequest, res: Response) => {
      const companyId = req.companyId!;
      const { id, phone } = req.query;

      const contact = await contactService.findOne(companyId, {
        id: id as string,
        phone: phone as string,
      });

      if (!contact) {
        return res.status(HTTP_STATUS.OK).json({
          status: "success",
          data: null,
        });
      }

      res.status(HTTP_STATUS.OK).json({
        status: "success",
        data: contact,
      });
    },
  ),

  deleteContact: catchAsync(
    async (req: AuthenticatedRequest, res: Response) => {
      const { id } = req.params;
      const companyId = req.companyId!;

      await contactService.delete(companyId, id);
      res.status(HTTP_STATUS.OK).json({ status: "success" });
    },
  ),

  getContactTimeline: catchAsync(
    async (req: AuthenticatedRequest, res: Response) => {
      const { id } = req.params;
      const companyId = req.companyId!;

      const result = await contactService.getTimeline(companyId, id);
      res.status(HTTP_STATUS.OK).json({
        status: "success",
        data: result,
      });
    },
  ),

  importContacts: catchAsync(
    async (req: AuthenticatedRequest, res: Response) => {
      const companyId = req.companyId!;
      const file = (req as AuthenticatedRequest & { file?: Express.Multer.File })
        .file;

    if (!file) throw new AppError("No file uploaded", 400);

    const { parseFile, normalizeRows } =
      await import("../services/CsvParserService");
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

