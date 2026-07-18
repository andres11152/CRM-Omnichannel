import { Router } from "express";
import { CommandController } from "../controllers/CommandController";

const router = Router();

router.post("/execute", CommandController.execute);

export default router;
