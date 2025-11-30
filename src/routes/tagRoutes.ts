import express from "express";
import { createTag, getTags, deleteTag } from "@/controllers/tagController";
import { protect } from "@/middleware/authMiddleware";

const router = express.Router();

router.use(protect);

router.route("/").get(getTags).post(createTag);

router.route("/:id").delete(deleteTag);

export default router;
