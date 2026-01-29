import express from "express";
import {
  getAccounts,
  getAccount,
  createAccount,
  updateAccount,
  deleteAccount,
} from "../controllers/crm/accountController";

const router = express.Router();

router.route("/").get(getAccounts).post(createAccount);

router.route("/:id").get(getAccount).patch(updateAccount).delete(deleteAccount);

export default router;
