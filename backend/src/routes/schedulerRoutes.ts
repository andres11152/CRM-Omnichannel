import { Router } from "express";
import { schedulerController } from "@/controllers/crm/schedulerController";
import { protect } from "@/middleware/authMiddleware";
import { validate } from "@/middleware/validationMiddleware";
import {
  GetSlotsSchema,
  BookMeetingSchema,
  SaveAvailabilitySchema,
  CreateMeetingTypeSchema,
  UpdateMeetingTypeSchema,
  GetMeetingTypeInfoSchema,
} from "@/schemas/schedulerSchema";

const router = Router();

// ==========================================
// PUBLIC ROUTES
// ==========================================
router.get("/slots", validate(GetSlotsSchema), schedulerController.getAvailableSlots);
router.get("/slots/info", validate(GetMeetingTypeInfoSchema), schedulerController.getMeetingTypeInfo);
router.post("/book", validate(BookMeetingSchema), schedulerController.bookMeeting);

// ==========================================
// AUTHENTICATED ROUTES (Protected)
// ==========================================
router.use(protect);

router.get("/availability", schedulerController.getAvailability);
router.post("/availability", validate(SaveAvailabilitySchema), schedulerController.saveAvailability);

router.get("/meeting-types", schedulerController.getMeetingTypes);
router.post("/meeting-types", validate(CreateMeetingTypeSchema), schedulerController.createMeetingType);
router.put("/meeting-types/:id", validate(UpdateMeetingTypeSchema), schedulerController.updateMeetingType);
router.delete("/meeting-types/:id", schedulerController.deleteMeetingType);

export default router;
