import express from "express";
import multer from "multer";
import { protect } from "../middleware/authMiddleware";
import {
  uploadMedia,
  getMedia,
  getMediaById,
  deleteMedia,
  updateMedia,
  getMediaContent,
} from "../controllers/mediaController";

const router = express.Router();

// Public Proxy Route for Media Content (Bypass Auth for <img> tags)
router.get("/:id/content", getMediaContent);

// Multer configuration for file upload
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB max
  },
});

// All routes require authentication
router.use(protect);

// Upload media
router.post("/upload", upload.single("file"), uploadMedia);

// Get all media (with filters)
router.get("/", getMedia);

// Get single media
router.get("/:id", getMediaById);

// Update media metadata
router.patch("/:id", updateMedia);

// Delete media
router.delete("/:id", deleteMedia);

export default router;
