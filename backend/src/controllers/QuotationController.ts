import { Response, NextFunction, Request } from "express";
import { QuotationStatus } from "@prisma/client";
import { AppError } from "../utils/AppError";
import { AuthenticatedRequest } from "../types/types";
import { quotationService } from "../services/QuotationService";

class QuotationController {
  getAll = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const companyId = req.user?.companyId;
      if (!companyId) {
        return next(new AppError("User does not belong to a company", 403));
      }

      const { contactId, dealId, status } = req.query;

      const quotations = await quotationService.getQuotations(companyId, {
        contactId: contactId as string,
        dealId: dealId as string,
        status: status as QuotationStatus,
      });

      res.status(200).json({
        status: "success",
        data: quotations,
      });
    } catch (error) {
      next(error);
    }
  };

  getById = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const companyId = req.user?.companyId;
      if (!companyId) {
        return next(new AppError("User does not belong to a company", 403));
      }

      const quotation = await quotationService.getQuotationById(companyId, req.params.id);
      if (!quotation) {
        return next(new AppError("Cotización no encontrada", 404));
      }

      res.status(200).json({
        status: "success",
        data: quotation,
      });
    } catch (error) {
      next(error);
    }
  };

  create = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const companyId = req.user?.companyId;
      const createdById = req.user?.id;

      if (!companyId) {
        return next(new AppError("User does not belong to a company", 403));
      }

      const quotation = await quotationService.createQuotation({
        title: req.body.title || "Cotización Comercial",
        items: req.body.items || [],
        currency: req.body.currency,
        contactId: req.body.contactId,
        dealId: req.body.dealId,
        notes: req.body.notes,
        terms: req.body.terms,
        validUntil: req.body.validUntil ? new Date(req.body.validUntil) : undefined,
        companyId,
        createdById,
      });

      res.status(201).json({
        status: "success",
        data: quotation,
      });
    } catch (error) {
      next(error);
    }
  };

  updateStatus = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const companyId = req.user?.companyId;
      if (!companyId) {
        return next(new AppError("User does not belong to a company", 403));
      }

      const { status } = req.body;
      if (!status || !Object.values(QuotationStatus).includes(status)) {
        return next(new AppError("Estado de cotización inválido", 400));
      }

      const updated = await quotationService.updateQuotationStatus(companyId, req.params.id, status);

      res.status(200).json({
        status: "success",
        data: updated,
      });
    } catch (error) {
      next(error);
    }
  };

  getHtmlPreview = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const companyId = req.user?.companyId;
      if (!companyId) {
        return next(new AppError("User does not belong to a company", 403));
      }

      const publicBaseUrl = `${req.protocol}://${req.get("host")}`;
      const html = await quotationService.generateHtml(companyId, req.params.id, publicBaseUrl);

      res.setHeader("Content-Type", "text/html");
      res.status(200).send(html);
    } catch (error) {
      next(error);
    }
  };

  getPublicByHash = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { hash } = req.params;
      const quotation = await quotationService.getQuotationByPublicHash(hash);

      if (!quotation) {
        return next(new AppError("Cotización no encontrada o expirada", 404));
      }

      res.status(200).json({
        status: "success",
        data: quotation,
      });
    } catch (error) {
      next(error);
    }
  };

  respondPublic = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { hash } = req.params;
      const { accept } = req.body; // boolean

      const quotation = await quotationService.getQuotationByPublicHash(hash);
      if (!quotation) {
        return next(new AppError("Cotización no encontrada", 404));
      }

      const newStatus = accept ? QuotationStatus.ACCEPTED : QuotationStatus.REJECTED;
      const updated = await quotationService.updateQuotationStatus(quotation.companyId, quotation.id, newStatus);

      res.status(200).json({
        status: "success",
        data: updated,
        message: accept ? "Cotización aceptada con éxito" : "Cotización rechazada",
      });
    } catch (error) {
      next(error);
    }
  };
}

export const quotationController = new QuotationController();
