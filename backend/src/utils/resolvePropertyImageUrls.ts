import { getSignedUrl } from "@/services/UploadService";
import { Logger } from "@/utils/logger";

/**
 * [SEC] 100-YEAR FIX: no asumir que el bucket S3 tiene una bucket policy de
 * lectura pública correctamente configurada. La URL guardada en BD
 * (`property.url`) apunta al endpoint directo del bucket — si "Block Public
 * Access" sigue activo o la policy nunca se aplicó, esas URLs dan 403/AccessDenied
 * y las fotos se ven "rotas" en el navegador sin importar el formato de la URL.
 *
 * En vez de depender de esa configuración externa (que no podemos verificar
 * ni editar desde aquí), regeneramos una URL firmada (signed URL, 1h) a
 * partir del `key` real en cada lectura — funciona sin importar si el bucket
 * es público o privado, y es el mismo mecanismo que ya usa el resto de la
 * app (`getMediaContent` / MediaService). Fallback silencioso a la URL
 * guardada si la firma falla, para no romper el render por completo.
 */
export const resolveImageUrls = async <T extends { url: string; key: string }>(
  images: T[],
): Promise<T[]> => {
  return Promise.all(
    images.map(async (image) => {
      try {
        const signed = await getSignedUrl(image.key);
        return signed ? { ...image, url: signed } : image;
      } catch (err) {
        Logger.warn(`[resolveImageUrls] Failed to sign ${image.key}:`, err);
        return image;
      }
    }),
  );
};
