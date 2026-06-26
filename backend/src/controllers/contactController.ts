import { Response } from "express";
import { catchAsync } from "@/utils/catchAsync";
import { AppError } from "@/utils/AppError";
import { HTTP_STATUS } from "@/constants/httpStatus";
import { contactService } from "@/services/ContactService";
import { planLimitsService } from "@/services/PlanLimitsService";
import { contactImportService } from "@/services/ContactImportService";
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

      const result = await contactImportService.importFromCsv(companyId, file);

      res.status(HTTP_STATUS.OK).json({
        success: true,
        ...result,
      });
    },
  ),
};

