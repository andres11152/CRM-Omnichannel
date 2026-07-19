import { Router, Request, Response, NextFunction } from "express";
import multer from "multer";
import { protect } from "@/middleware/authMiddleware";
import { validate } from "@/middleware/validationMiddleware";
import { requirePermission } from "@/middleware/permissionMiddleware";
import { tenantContextMiddleware } from "@/middleware/tenantContext";
import { propertyController } from "@/controllers/propertyController";
import { AppError } from "@/utils/AppError";
import {
  CreatePropertySchema,
  UpdatePropertySchema,
  PropertyIdParamSchema,
  PublishPropertySchema,
  ListPropertiesSchema,
  ImageIdParamSchema,
  ReorderImagesSchema,
  SetCoverSchema,
} from "@/schemas/propertySchema";

const router = Router();

// Multer en memoria para subir imágenes (compresión + S3 en UploadService).
// Solo se aceptan imágenes: cualquier otro tipo se rechaza con un mensaje claro
// en vez de intentar "comprimirlo" silenciosamente en UploadService.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 40 }, // 10MB por imagen
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
      return;
    }
    cb(new AppError("Solo se permiten archivos de imagen (JPG, PNG, WebP, GIF).", 400));
  },
});

/** Traduce errores de Multer (tamaño/cantidad/campo) a mensajes claros para el cliente. */
const handleImageUploadError = (
  error: unknown,
  _req: Request,
  _res: Response,
  next: NextFunction,
) => {
  if (error instanceof multer.MulterError) {
    if (error.code === "LIMIT_FILE_SIZE") {
      return next(new AppError("Cada imagen debe pesar máximo 10MB.", 400));
    }
    if (error.code === "LIMIT_FILE_COUNT") {
      return next(new AppError("Máximo 40 imágenes por inmueble.", 400));
    }
    if (error.code === "LIMIT_UNEXPECTED_FILE") {
      return next(new AppError("Campo de archivo inesperado. Usa 'images'.", 400));
    }
  }
  next(error);
};

router.use(protect);

// Catálogo (selects/filtros del frontend)
router.get("/catalog", propertyController.getCatalog);

// Listado con filtros avanzados + paginación
router.get(
  "/",
  requirePermission("PROPERTIES", "VIEW", "all"),
  validate(ListPropertiesSchema),
  propertyController.list,
);

// Detalle
router.get(
  "/:id",
  requirePermission("PROPERTIES", "VIEW", "all"),
  validate(PropertyIdParamSchema),
  propertyController.getById,
);

// Crear
router.post(
  "/",
  requirePermission("PROPERTIES", "CREATE", "any"),
  validate(CreatePropertySchema),
  propertyController.create,
);

// Actualizar
router.put(
  "/:id",
  requirePermission("PROPERTIES", "EDIT", "all"),
  validate(UpdatePropertySchema),
  propertyController.update,
);

// Publicar / despublicar ficha pública
router.patch(
  "/:id/publish",
  requirePermission("PROPERTIES", "MANAGE", "publish"),
  validate(PublishPropertySchema),
  propertyController.publish,
);

// Eliminar (soft delete)
router.delete(
  "/:id",
  requirePermission("PROPERTIES", "DELETE", "all"),
  validate(PropertyIdParamSchema),
  propertyController.remove,
);

// ── Galería ──────────────────────────────────────────────
router.post(
  "/:id/images",
  requirePermission("PROPERTIES", "EDIT", "all"),
  validate(PropertyIdParamSchema),
  upload.array("images", 40),
  handleImageUploadError,
  // [SEC] multer's busboy-based multipart parser loses the AsyncLocalStorage
  // tenant context for files large enough to need multiple internal
  // read/parse cycles (confirmed: present before upload.array(), gone right
  // after it for a 1.2MB file, while small files that parse in one pass are
  // fine) — every downstream Prisma call then throws SECURITY VIOLATION.
  // req.user survives (set via Object.defineProperty in `protect`, not
  // ALS-based), so re-establish context from it before reaching the controller.
  tenantContextMiddleware,
  propertyController.uploadImages,
);

router.patch(
  "/:id/images/reorder",
  requirePermission("PROPERTIES", "EDIT", "all"),
  validate(ReorderImagesSchema),
  propertyController.reorderImages,
);

router.patch(
  "/:id/images/cover",
  requirePermission("PROPERTIES", "EDIT", "all"),
  validate(SetCoverSchema),
  propertyController.setCover,
);

router.delete(
  "/:id/images/:imageId",
  requirePermission("PROPERTIES", "EDIT", "all"),
  validate(ImageIdParamSchema),
  propertyController.deleteImage,
);

export default router;
