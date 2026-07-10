import { Request, Response, NextFunction } from "express";
import { AuthenticatedRequest } from "@/types/types";
import { SchedulerService, BookingInput } from "@/services/SchedulerService";
import { availabilityRepository } from "@/repositories/AvailabilityRepository";
import { meetingTypeRepository } from "@/repositories/MeetingTypeRepository";
import { AppError } from "@/utils/AppError";
import { TenantContextManager } from "@/config/tenantContext";

class SchedulerController {
  // ========================================================
  // PUBLIC ROUTES (No auth context required)
  // ========================================================
  // [SEC] Estas rutas son públicas a propósito (sin `protect`), así que nunca
  // pasan por el middleware que arma el contexto de tenant (TenantContextManager.run)
  // que exige el guard RLS de Prisma para cualquier modelo no listado en
  // GLOBAL_MODELS (User, MeetingType, Availability, Activity, Contact no lo están).
  // Sin esto, cualquier consulta aquí lanzaba "SECURITY VIOLATION" (500), tumbando
  // la página pública de reservas por completo. Las queries ya filtran por
  // companyId explícito, así que runAsSystem (mismo patrón que
  // publicPropertyController) es correcto aquí, no una omisión de seguridad.
  // El callback debe ser async con un `await` interno: los métodos de Prisma
  // devuelven thenables perezosos que solo despachan (y activan el guard RLS)
  // al ser esperados; sin el await, eso ocurriría fuera de la ventana de
  // contexto de runAsSystem.

  /**
   * Get available slots for a given day
   */
  getAvailableSlots = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const companyId = req.query.companyId as string;
      const agent = req.query.agent as string;
      const meetingType = req.query.meetingType as string;
      const date = req.query.date as string;

      const slots = await TenantContextManager.runAsSystem(async () =>
        SchedulerService.getAvailableSlots(companyId, agent, meetingType, date)
      );

      res.status(200).json({
        status: "success",
        data: slots,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Book a slot for a guest
   */
  bookMeeting = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const input = req.body as BookingInput;
      const result = await TenantContextManager.runAsSystem(async () =>
        SchedulerService.bookSlot(input)
      );

      res.status(201).json({
        status: "success",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Resolve details of a public scheduler URL
   */
  getMeetingTypeInfo = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const companySlug = req.query.companySlug as string;
      const agentSlug = req.query.agentSlug as string;
      const meetingTypeSlug = req.query.meetingTypeSlug as string;

      const info = await TenantContextManager.runAsSystem(async () =>
        SchedulerService.getMeetingTypeInfo(companySlug, agentSlug, meetingTypeSlug)
      );

      res.status(200).json({
        status: "success",
        data: info,
      });
    } catch (error) {
      next(error);
    }
  };

  // ========================================================
  // AUTHENTICATED ROUTES (Agent config context)
  // ========================================================

  /**
   * Get availability configuration for current agent
   */
  getAvailability = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const companyId = req.user?.companyId;
      const userId = req.user?.id;

      if (!companyId || !userId) {
        return next(new AppError("Not authorized", 401));
      }

      const availability = await availabilityRepository.findFirst({
        where: { userId },
      }, companyId);

      res.status(200).json({
        status: "success",
        data: availability || { timezone: "America/Bogota", rules: [] },
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Save/Update availability configuration for current agent
   */
  saveAvailability = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const companyId = req.user?.companyId;
      const userId = req.user?.id;
      const { timezone, rules } = req.body;

      if (!companyId || !userId) {
        return next(new AppError("Not authorized", 401));
      }

      const availability = await availabilityRepository.upsert(
        userId,
        companyId,
        timezone,
        rules
      );

      res.status(200).json({
        status: "success",
        data: availability,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Get all meeting types defined by the current agent
   */
  getMeetingTypes = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const companyId = req.user?.companyId;
      const userId = req.user?.id;

      if (!companyId || !userId) {
        return next(new AppError("Not authorized", 401));
      }

      const meetingTypes = await meetingTypeRepository.findMany({
        where: { userId },
      }, companyId);

      res.status(200).json({
        status: "success",
        data: meetingTypes,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Create a new meeting type
   */
  createMeetingType = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const companyId = req.user?.companyId;
      const userId = req.user?.id;

      if (!companyId || !userId) {
        return next(new AppError("Not authorized", 401));
      }

      const { name, slug, description, duration, isActive } = req.body;

      // Check if slug is unique for this user
      const existing = await meetingTypeRepository.findFirst({
        where: { userId, slug },
      }, companyId);

      if (existing) {
        return next(new AppError("Ya existe un tipo de reunión con este slug para tu perfil.", 400));
      }

      const meetingType = await meetingTypeRepository.create({
        data: {
          companyId,
          userId,
          name,
          slug,
          description: description || null,
          duration,
          isActive: isActive !== undefined ? isActive : true,
        },
      }, companyId);

      res.status(201).json({
        status: "success",
        data: meetingType,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Update a meeting type
   */
  updateMeetingType = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const companyId = req.user?.companyId;
      const userId = req.user?.id;
      const { id } = req.params;

      if (!companyId || !userId) {
        return next(new AppError("Not authorized", 401));
      }

      const existing = await meetingTypeRepository.findFirst({
        where: { id, userId },
      }, companyId);

      if (!existing) {
        return next(new AppError("Tipo de reunión no encontrado", 404));
      }

      const { name, slug, description, duration, isActive } = req.body;

      if (slug && slug !== existing.slug) {
        const slugCollision = await meetingTypeRepository.findFirst({
          where: { userId, slug },
        }, companyId);

        if (slugCollision) {
          return next(new AppError("Ya existe otra reunión con este slug.", 400));
        }
      }

      const updated = await meetingTypeRepository.update({
        where: { id },
        data: {
          name,
          slug,
          description: description !== undefined ? description : undefined,
          duration,
          isActive,
        },
      }, companyId);

      res.status(200).json({
        status: "success",
        data: updated,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Delete a meeting type
   */
  deleteMeetingType = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const companyId = req.user?.companyId;
      const userId = req.user?.id;
      const { id } = req.params;

      if (!companyId || !userId) {
        return next(new AppError("Not authorized", 401));
      }

      const existing = await meetingTypeRepository.findFirst({
        where: { id, userId },
      }, companyId);

      if (!existing) {
        return next(new AppError("Tipo de reunión no encontrado", 404));
      }

      await meetingTypeRepository.delete(id, companyId);

      res.status(204).send();
    } catch (error) {
      next(error);
    }
  };
}

export const schedulerController = new SchedulerController();
