import express from "express";
import multer from "multer";
import { protect } from "../middleware/authMiddleware";
import { validate } from "../middleware/validationMiddleware";
import {
  uploadMedia,
  getMedia,
  getMediaById,
  deleteMedia,
  updateMedia,
  getMediaContent,
} from "../controllers/mediaController";
import {
  MediaIdParamSchema,
  GetMediaListSchema,
  UploadMediaSchema,
  UpdateMediaSchema,
} from "../schemas/mediaSchema";

const router = express.Router();

// Public Proxy Route for Media Content (Bypass Auth for <img> tags)
// 🛡️ Still validates param to prevent path traversal
router.get("/:id/content", validate(MediaIdParamSchema), getMediaContent);

// Multer configuration for file upload
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB max
  },
});

// All routes below require authentication
router.use(protect);

// Upload media (file + metadata validated)
router.post(
  "/upload",
  upload.single("file"),
  validate(UploadMediaSchema),
  uploadMedia,
);

// Get all media (with validated filters & pagination)
router.get("/", validate(GetMediaListSchema), getMedia);

// Get single media (validated ID)
router.get("/:id", validate(MediaIdParamSchema), getMediaById);

// Update media metadata (validated ID + body)
router.patch("/:id", validate(UpdateMediaSchema), updateMedia);

// Delete media (validated ID)
router.delete("/:id", validate(MediaIdParamSchema), deleteMedia);

export default router;
