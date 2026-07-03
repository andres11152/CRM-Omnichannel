import { AppError } from "@/utils/AppError";
import { Logger } from "@/utils/logger";
import { propertyRepository } from "@/repositories/PropertyRepository";
import { uploadFile, deleteFile, MulterFile } from "@/services/UploadService";
import { resolveImageUrls } from "@/utils/resolvePropertyImageUrls";

/**
 * [REAL ESTATE] PROPERTY IMAGE SERVICE
 *
 * Gestiona la galería de fotos del inmueble. Reutiliza el UploadService
 * existente (compresión sharp + subida a S3 con URL pública directa).
 * No reimplementa S3.
 */

const MAX_IMAGES_PER_PROPERTY = 40;

/** Valida que el inmueble exista y pertenezca a la empresa. */
const assertOwnership = async (propertyId: string, companyId: string) => {
  const property = await propertyRepository.findFirst({
    where: { id: propertyId, companyId, deletedAt: null },
    include: { images: { orderBy: { order: "asc" } } },
  });
  if (!property) {
    throw new AppError("Inmueble no encontrado", 404);
  }
  return property;
};

export const propertyImageService = {
  /** Sube N imágenes y las agrega al final de la galería. */
  async addImages(propertyId: string, companyId: string, files: MulterFile[]) {
    if (!files || files.length === 0) {
      throw new AppError("No se recibieron imágenes", 400);
    }

    const property = await assertOwnership(propertyId, companyId);

    if (property.images.length + files.length > MAX_IMAGES_PER_PROPERTY) {
      throw new AppError(
        `Máximo ${MAX_IMAGES_PER_PROPERTY} imágenes por inmueble`,
        400,
      );
    }

    let nextOrder = property.images.length;
    const hasCover = property.images.some((img) => img.isCover);

    const created = [];
    for (const file of files) {
      const uploaded = await uploadFile(file, { companyId, type: "IMAGE" });
      const image = await propertyRepository.createImage({
        data: {
          propertyId,
          url: uploaded.url,
          key: uploaded.key,
          order: nextOrder,
          // La primera imagen del inmueble (si no hay cover) queda como portada.
          isCover: !hasCover && nextOrder === property.images.length,
        },
      });
      created.push(image);
      nextOrder++;
    }

    Logger.info(`[PropertyImage] +${created.length} imgs → ${property.reference}`);
    return resolveImageUrls(created);
  },

  /** Elimina una imagen de la galería y de S3. Promueve nueva portada si aplica. */
  async deleteImage(propertyId: string, imageId: string, companyId: string) {
    await assertOwnership(propertyId, companyId);

    const image = await propertyRepository.findImage({
      where: { id: imageId, propertyId },
    });
    if (!image) {
      throw new AppError("Imagen no encontrada", 404);
    }

    // Borra de S3 (best-effort: no bloquea el borrado en BD si S3 falla).
    try {
      await deleteFile(image.key);
    } catch (err) {
      Logger.warn(`[PropertyImage] No se pudo borrar de S3 ${image.key}: ${String(err)}`);
    }

    await propertyRepository.deleteImage(imageId);

    // Si era la portada, asciende la primera imagen restante.
    if (image.isCover) {
      const next = await propertyRepository.findImage({
        where: { propertyId },
        orderBy: { order: "asc" },
      });
      if (next) {
        await propertyRepository.updateImage({
          where: { id: next.id },
          data: { isCover: true },
        });
      }
    }

    Logger.info(`[PropertyImage] Deleted ${imageId} from ${propertyId}`);
  },

  /** Reordena la galería según el arreglo de IDs recibido. */
  async reorderImages(propertyId: string, companyId: string, orderedIds: string[]) {
    const property = await assertOwnership(propertyId, companyId);

    const validIds = new Set(property.images.map((i) => i.id));
    const badId = orderedIds.find((id) => !validIds.has(id));
    if (badId) {
      throw new AppError(`La imagen ${badId} no pertenece a este inmueble`, 400);
    }

    await Promise.all(
      orderedIds.map((id, index) =>
        propertyRepository.updateImage({ where: { id }, data: { order: index } }),
      ),
    );

    Logger.info(`[PropertyImage] Reordered ${orderedIds.length} imgs on ${propertyId}`);
    return this.list(propertyId, companyId);
  },

  /** Define la portada (isCover=true en una, false en el resto). */
  async setCover(propertyId: string, companyId: string, imageId: string) {
    await assertOwnership(propertyId, companyId);

    const image = await propertyRepository.findImage({
      where: { id: imageId, propertyId },
    });
    if (!image) {
      throw new AppError("Imagen no encontrada", 404);
    }

    await propertyRepository.updateManyImages({
      where: { propertyId },
      data: { isCover: false },
    });
    await propertyRepository.updateImage({
      where: { id: imageId },
      data: { isCover: true },
    });

    Logger.info(`[PropertyImage] Cover set to ${imageId} on ${propertyId}`);
    return this.list(propertyId, companyId);
  },

  async list(propertyId: string, companyId: string) {
    const property = await assertOwnership(propertyId, companyId);
    return resolveImageUrls(property.images);
  },
};
