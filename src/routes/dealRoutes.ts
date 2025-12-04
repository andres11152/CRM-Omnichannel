import express from "express";
import {
  getDeals,
  getDeal,
  createDeal,
  updateDeal,
  deleteDeal,
} from "../controllers/crm/dealController";

const router = express.Router();

router.route("/").get(getDeals).post(createDeal);

router.route("/:id").get(getDeal).patch(updateDeal).delete(deleteDeal);

export default router;
