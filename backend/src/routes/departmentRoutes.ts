import { Router } from "express";
import {
  getDepartments,
  createDepartment,
  updateDepartment,
  deleteDepartment,
} from "../controllers/departmentController";
import { protect } from "../middleware/authMiddleware";
import { validate } from "@/middleware/validationMiddleware";
import {
  CreateDepartmentSchema,
  UpdateDepartmentSchema,
  DepartmentIdParamSchema,
} from "@/schemas/department.schema";

const router = Router();

router.use(protect);

router.get("/", getDepartments);
router.post("/", validate(CreateDepartmentSchema), createDepartment);
router.put("/:id", validate(UpdateDepartmentSchema), updateDepartment);
router.delete("/:id", validate(DepartmentIdParamSchema), deleteDepartment);

export default router;
