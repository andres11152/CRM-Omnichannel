import express from "express";
import {
  getDeals,
  getDeal,
  createDeal,
  updateDeal,
  updateDealOrder,
  deleteDeal,
} from "../controllers/crm/dealController";
import { validate } from "../middleware/validationMiddleware";
import {
  CreateDealSchema,
  UpdateDealSchema,
  UpdateDealOrderSchema,
  GetDealsSchema,
  GetDealSchema,
  DeleteDealSchema,
} from "../schemas/dealSchema";

const router = express.Router();

/**
 * 💼 DEAL ROUTES
 * All routes include Zod validation for security and data integrity
 */

// GET /deals?pipelineId=xxx&stageId=yyy
// POST /deals
router
  .route("/")
  .get(validate(GetDealsSchema), getDeals)
  .post(validate(CreateDealSchema), createDeal);

// GET /deals/:id
// PATCH /deals/:id
// DELETE /deals/:id
router
  .route("/:id")
  .get(validate(GetDealSchema), getDeal)
  .patch(validate(UpdateDealSchema), updateDeal)
  .delete(validate(DeleteDealSchema), deleteDeal);

// PATCH /deals/:id/order
// For Kanban drag-and-drop reordering
router
  .route("/:id/order")
  .patch(validate(UpdateDealOrderSchema), updateDealOrder);

export default router;

