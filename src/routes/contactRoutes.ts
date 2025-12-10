import { Router } from "express";
import { contactController } from "../controllers/contactController";
import { protect } from "../middleware/authMiddleware";

const router = Router();

router.use(protect);

router.post("/", contactController.createContact);
// Timeline
router.get("/:id/timeline", contactController.getContactTimeline);
router.get("/", contactController.getContacts);
router.put("/:id", contactController.updateContact);
router.delete("/:id", contactController.deleteContact);

export const contactRouter = router;
