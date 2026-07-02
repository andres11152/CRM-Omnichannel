import { Router } from "express";
import { validate } from "@/middleware/validationMiddleware";
import { getPublicProperty } from "@/controllers/publicPropertyController";
import { PublicPropertyParamSchema } from "@/schemas/propertySchema";

/**
 * [REAL ESTATE] RUTAS PÚBLICAS DE PROPIEDADES
 *
 * Sin `protect`: sirven la ficha pública compartible por publicId.
 * Solo lectura de inmuebles publicados (filtrado en el controller).
 */
const router = Router();

router.get("/:publicId", validate(PublicPropertyParamSchema), getPublicProperty);

export default router;
