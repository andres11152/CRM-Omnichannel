import { Response, NextFunction } from "express";
import { AppError } from "@/utils/AppError";
import { AuthenticatedRequest } from "@/types/types";
import {
  propertyCrudService,
  CreatePropertyDTO,
  PropertyFilters,
} from "@/services/PropertyCrudService";
import { propertyImageService } from "@/services/PropertyImageService";
import { MulterFile } from "@/services/UploadService";
import { PROPERTY_CATALOG } from "@/constants/propertyCatalogs";

/**
 * [REAL ESTATE] PROPERTY CONTROLLER
 *
 * Orquestador HTTP del módulo inmobiliario. Todo el acceso a datos se delega
 * a los services (SRP). companyId siempre proviene del usuario autenticado.
 */

class PropertyController {
  private getCompanyId(req: AuthenticatedRequest, next: NextFunction): string | null {
    const companyId = req.user?.companyId;
    if (!companyId) {
      next(new AppError("El usuario no pertenece a una empresa", 403));
      return null;
    }
    return companyId;
  }

  getCatalog = async (_req: AuthenticatedRequest, res: Response) => {
    res.status(200).json({ status: "success", data: PROPERTY_CATALOG });
  };

  list = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const companyId = this.getCompanyId(req, next);
      if (!companyId) return;

      const result = await propertyCrudService.findAll(
        companyId,
        req.query as unknown as PropertyFilters,
      );
      res.status(200).json({ status: "success", ...result });
    } catch (error) {
      next(error);
    }
  };

  getById = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const companyId = this.getCompanyId(req, next);
      if (!companyId) return;

      const property = await propertyCrudService.findById(req.params.id, companyId);
      res.status(200).json({ status: "success", data: property });
    } catch (error) {
      next(error);
    }
  };

  create = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const companyId = this.getCompanyId(req, next);
      if (!companyId) return;

      const property = await propertyCrudService.create(
        companyId,
        req.body as unknown as CreatePropertyDTO,
      );
      res.status(201).json({ status: "success", data: property });
    } catch (error) {
      next(error);
    }
  };

  update = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const companyId = this.getCompanyId(req, next);
      if (!companyId) return;

      const property = await propertyCrudService.update(
        req.params.id,
        companyId,
        req.body,
      );
      res.status(200).json({ status: "success", data: property });
    } catch (error) {
      next(error);
    }
  };

  publish = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const companyId = this.getCompanyId(req, next);
      if (!companyId) return;

      const property = await propertyCrudService.setPublished(
        req.params.id,
        companyId,
        (req.body as unknown as { isPublished: boolean }).isPublished,
      );
      res.status(200).json({ status: "success", data: property });
    } catch (error) {
      next(error);
    }
  };

  remove = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const companyId = this.getCompanyId(req, next);
      if (!companyId) return;

      await propertyCrudService.softDelete(req.params.id, companyId, req.user.id);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  };

  // ── Galería ──────────────────────────────────────────────
  uploadImages = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const companyId = this.getCompanyId(req, next);
      if (!companyId) return;

      const files = (req.files as MulterFile[]) || [];
      const images = await propertyImageService.addImages(req.params.id, companyId, files);
      res.status(201).json({ status: "success", data: images });
    } catch (error) {
      next(error);
    }
  };

  deleteImage = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const companyId = this.getCompanyId(req, next);
      if (!companyId) return;

      await propertyImageService.deleteImage(req.params.id, req.params.imageId, companyId);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  };

  reorderImages = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const companyId = this.getCompanyId(req, next);
      if (!companyId) return;

      const images = await propertyImageService.reorderImages(
        req.params.id,
        companyId,
        (req.body as unknown as { orderedIds: string[] }).orderedIds,
      );
      res.status(200).json({ status: "success", data: images });
    } catch (error) {
      next(error);
    }
  };

  setCover = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const companyId = this.getCompanyId(req, next);
      if (!companyId) return;

      const images = await propertyImageService.setCover(
        req.params.id,
        companyId,
        (req.body as unknown as { imageId: string }).imageId,
      );
      res.status(200).json({ status: "success", data: images });
    } catch (error) {
      next(error);
    }
  };
}

export const propertyController = new PropertyController();
