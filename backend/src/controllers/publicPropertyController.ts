import { Request, Response } from "express";
import { propertyRepository } from "@/repositories/PropertyRepository";
import { resolveImageUrls } from "@/utils/resolvePropertyImageUrls";
import { Logger } from "@/utils/logger";
import { TenantContextManager } from "@/config/tenantContext";

/**
 * [REAL ESTATE] PUBLIC PROPERTY CONTROLLER
 *
 * Sirve la ficha pública de un inmueble por su publicId impredecible.
 * Sin autenticación: solo devuelve inmuebles publicados y no eliminados,
 * y omite datos sensibles (propietario, comisión, dirección si está oculta).
 */
export const getPublicProperty = async (req: Request, res: Response) => {
  const { publicId } = req.params;

  try {
    // [SEC] 100-YEAR FIX: esta ruta es pública a propósito (sin `protect`),
    // así que nunca pasa por el middleware que arma el contexto de tenant
    // (TenantContextManager.run) que exige el guard RLS de Prisma para
    // cualquier modelo no listado en GLOBAL_MODELS — y `Property` no lo está.
    // Sin esto, CUALQUIER consulta aquí lanzaba "SECURITY VIOLATION" (500),
    // tumbando la ficha pública para TODO inmueble publicado. La query ya es
    // segura sin tenant: filtra por publicId único e impredecible +
    // isPublished=true, así que runAsSystem (mismo patrón que
    // MessageRevocationHandler para lookups legítimos cross-tenant) es
    // correcto aquí, no una omisión de seguridad.
    const property = await TenantContextManager.runAsSystem(() =>
      propertyRepository.findFirst({
        where: { publicId, isPublished: true, deletedAt: null },
        include: {
          images: { orderBy: { order: "asc" } },
          company: { select: { name: true, phone: true, logoUrl: true } },
        },
      }),
    );

    if (!property) {
      return res.status(404).json({ status: "error", message: "Inmueble no disponible" });
    }

    // Incrementa contador de vistas (best-effort, no bloquea la respuesta).
    TenantContextManager.runAsSystem(() =>
      propertyRepository.updateMany({
        where: { id: property.id },
        data: { viewsCount: { increment: 1 } },
      }),
    ).catch((err) => Logger.warn(`[PublicProperty] views++ failed: ${String(err)}`));

    const signedImages = await resolveImageUrls(property.images);

    // Payload seguro: se omiten propietario, comisión, matrícula, catastral,
    // captación y dirección exacta si addressVisible=false.
    const safe = {
      publicId: property.publicId,
      reference: property.reference,
      operation: property.operation,
      kind: property.kind,
      status: property.status,
      condition: property.condition,
      title: property.title,
      description: property.description,
      highlights: property.highlights,
      price: property.price,
      currency: property.currency,
      adminFee: property.adminFee,
      priceIncludesAdmin: property.priceIncludesAdmin,
      negotiable: property.negotiable,
      pricePerM2: property.pricePerM2,
      builtArea: property.builtArea,
      privateArea: property.privateArea,
      lotArea: property.lotArea,
      bedrooms: property.bedrooms,
      bathrooms: property.bathrooms,
      parkingSpots: property.parkingSpots,
      floor: property.floor,
      totalFloors: property.totalFloors,
      yearBuilt: property.yearBuilt,
      stratum: property.stratum,
      country: property.country,
      department: property.department,
      city: property.city,
      neighborhood: property.neighborhood,
      // Dirección exacta solo si el asesor la marcó como visible.
      address: property.addressVisible ? property.address : null,
      latitude: property.addressVisible ? property.latitude : null,
      longitude: property.addressVisible ? property.longitude : null,
      features: property.features,
      amenities: property.amenities,
      videoUrl: property.videoUrl,
      virtualTourUrl: property.virtualTourUrl,
      images: signedImages.map((img) => ({
        url: img.url,
        isCover: img.isCover,
        order: img.order,
      })),
      company: property.company,
      publishedAt: property.publishedAt,
    };

    return res.status(200).json({ status: "success", data: safe });
  } catch (error) {
    Logger.error(`[PublicProperty] Error serving ${publicId}:`, error);
    return res.status(500).json({ status: "error", message: "Error al cargar el inmueble" });
  }
};
