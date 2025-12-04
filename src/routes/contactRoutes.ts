import { Router } from "express";
import { contactController } from "../controllers/contactController";
import { protect } from "../middleware/authMiddleware";

const router = Router();

router.use(protect);

router.post("/", contactController.createContact);
router.get("/", contactController.getContacts);
router.patch("/:id", contactController.updateContact);
router.delete("/:id", contactController.deleteContact);

export const contactRouter = router;
