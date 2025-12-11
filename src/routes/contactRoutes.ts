import { Router } from "express";
import { contactController } from "../controllers/contactController";
import { protect } from "../middleware/authMiddleware";

const router = Router();

router.use(protect);

// Search/Detail logic
router.get("/detail", contactController.getContactDetail);

router.post("/", contactController.upsertContact);
// Timeline
router.get("/:id/timeline", contactController.getContactTimeline);
router.get("/", contactController.getContacts);
// router.put("/:id", contactController.updateContact); // Deprecated fav of upsert
router.delete("/:id", contactController.deleteContact);

export const contactRouter = router;
