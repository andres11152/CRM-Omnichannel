import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import {
  Building2,
  MapPin,
  BedDouble,
  Bath,
  Car,
  Ruler,
  Layers,
  MessageCircle,
  PlayCircle,
  Rotate3D,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { getPublicProperty } from "@/services/propertyService";
import {
  type Property,
  OPERATION_LABELS,
  KIND_LABELS,
  CONDITION_LABELS,
  formatCOP,
} from "@/types/property.types";

/**
 * [REAL ESTATE] Ficha pública del inmueble — /p/:publicId
 * Sin autenticación. Pensada para compartir por WhatsApp/redes.
 */

const SpecTile: React.FC<{ icon: React.ReactNode; label: string; value: React.ReactNode }> = ({
  icon,
  label,
  value,
}) => (
  <div className="flex flex-col items-center gap-1 p-3 bg-white rounded-xl border border-gray-100 shadow-sm">
    <span className="text-indigo-600">{icon}</span>
    <span className="text-lg font-bold text-gray-800">{value}</span>
    <span className="text-[11px] text-gray-500 uppercase tracking-wide">{label}</span>
  </div>
);

export const PublicPropertyPage: React.FC = () => {
  const { publicId } = useParams<{ publicId: string }>();
  const [property, setProperty] = useState<Property | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeImg, setActiveImg] = useState(0);

  useEffect(() => {
    if (!publicId) return;
    getPublicProperty(publicId)
      .then(setProperty)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [publicId]);

  useEffect(() => {
    if (property) {
      document.title = `${property.title} · ${formatCOP(property.price, property.currency)}`;
    }
  }, [property]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-pulse flex flex-col items-center gap-3 text-gray-400">
          <Building2 className="w-12 h-12" />
          <span className="text-sm">Cargando inmueble…</span>
        </div>
      </div>
    );
  }

  if (error || !property) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center">
          <Building2 className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-gray-700">Inmueble no disponible</h1>
          <p className="text-sm text-gray-500 mt-1">
            Este inmueble ya no está publicado o el enlace es incorrecto.
          </p>
        </div>
      </div>
    );
  }

  const gallery = property.images ?? [];
  const company = (property as Property & {
    company?: { name?: string; phone?: string | null; logoUrl?: string | null };
  }).company;

  const waText = encodeURIComponent(
    `Hola, me interesa el inmueble "${property.title}" (Ref. ${property.reference}) que vi en la ficha pública.`,
  );
  const waHref = company?.phone
    ? `https://wa.me/${company.phone.replace(/\D/g, "")}?text=${waText}`
    : `https://wa.me/?text=${waText}`;

  const location = [property.neighborhood, property.city, property.department]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header inmobiliaria */}
      <header className="bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3 sticky top-0 z-20">
        {company?.logoUrl ? (
          <img src={company.logoUrl} alt={company.name} className="w-9 h-9 rounded-lg object-cover" />
        ) : (
          <div className="w-9 h-9 rounded-lg bg-indigo-600 flex items-center justify-center">
            <Building2 className="w-5 h-5 text-white" />
          </div>
        )}
        <div className="min-w-0">
          <p className="font-bold text-gray-800 text-sm truncate">{company?.name ?? "Inmobiliaria"}</p>
          <p className="text-[11px] text-gray-400 font-mono">Ref. {property.reference}</p>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 pt-4 space-y-5">
        {/* Galería */}
        {gallery.length > 0 && (
          <div className="relative rounded-2xl overflow-hidden shadow-lg bg-gray-200">
            <div className="aspect-[4/3] sm:aspect-video">
              <img
                src={gallery[activeImg]?.url}
                alt={property.title}
                className="w-full h-full object-cover"
              />
            </div>
            {gallery.length > 1 && (
              <>
                <button
                  onClick={() => setActiveImg((i) => (i - 1 + gallery.length) % gallery.length)}
                  className="absolute left-2 top-1/2 -translate-y-1/2 p-2 bg-black/40 hover:bg-black/60 rounded-full text-white"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <button
                  onClick={() => setActiveImg((i) => (i + 1) % gallery.length)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-black/40 hover:bg-black/60 rounded-full text-white"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
                <span className="absolute bottom-2 right-2 text-xs bg-black/60 text-white px-2 py-0.5 rounded-full">
                  {activeImg + 1}/{gallery.length}
                </span>
              </>
            )}
          </div>
        )}

        {/* Título + precio */}
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-indigo-100 text-indigo-700">
              {OPERATION_LABELS[property.operation]}
            </span>
            <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-gray-100 text-gray-600">
              {KIND_LABELS[property.kind]}
            </span>
            {property.condition && (
              <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-amber-100 text-amber-700">
                {CONDITION_LABELS[property.condition]}
              </span>
            )}
          </div>
          <h1 className="text-2xl font-black text-gray-900 mt-2">{property.title}</h1>
          {location && (
            <p className="text-sm text-gray-500 flex items-center gap-1 mt-1">
              <MapPin className="w-4 h-4" /> {location}
            </p>
          )}
          <div className="mt-3 flex items-baseline gap-3 flex-wrap">
            <span className="text-3xl font-black text-indigo-600">
              {formatCOP(property.price, property.currency)}
            </span>
            {property.adminFee ? (
              <span className="text-sm text-gray-500">
                + {formatCOP(property.adminFee)} administración
              </span>
            ) : null}
            {property.negotiable && (
              <span className="text-xs font-semibold text-emerald-600">Negociable</span>
            )}
          </div>
          {property.pricePerM2 ? (
            <p className="text-xs text-gray-400 mt-0.5">
              {formatCOP(property.pricePerM2)} / m²
            </p>
          ) : null}
        </div>

        {/* Specs */}
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
          {property.builtArea != null && (
            <SpecTile icon={<Ruler className="w-5 h-5" />} label="m² constr." value={property.builtArea} />
          )}
          {property.bedrooms != null && (
            <SpecTile icon={<BedDouble className="w-5 h-5" />} label="Habitaciones" value={property.bedrooms} />
          )}
          {property.bathrooms != null && (
            <SpecTile icon={<Bath className="w-5 h-5" />} label="Baños" value={property.bathrooms} />
          )}
          {property.parkingSpots != null && (
            <SpecTile icon={<Car className="w-5 h-5" />} label="Parqueadero" value={property.parkingSpots} />
          )}
          {property.stratum != null && (
            <SpecTile icon={<Layers className="w-5 h-5" />} label="Estrato" value={property.stratum} />
          )}
        </div>

        {/* Descripción */}
        {property.description && (
          <section className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
            <h2 className="font-bold text-gray-800 mb-2">Descripción</h2>
            <p className="text-sm text-gray-600 whitespace-pre-line leading-relaxed">
              {property.description}
            </p>
          </section>
        )}

        {/* Características */}
        {(property.features.length > 0 || property.amenities.length > 0) && (
          <section className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm space-y-3">
            {property.features.length > 0 && (
              <div>
                <h2 className="font-bold text-gray-800 mb-2">El inmueble</h2>
                <div className="flex flex-wrap gap-1.5">
                  {property.features.map((f) => (
                    <span key={f} className="text-xs px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700">
                      {f}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {property.amenities.length > 0 && (
              <div>
                <h2 className="font-bold text-gray-800 mb-2">El conjunto</h2>
                <div className="flex flex-wrap gap-1.5">
                  {property.amenities.map((a) => (
                    <span key={a} className="text-xs px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700">
                      {a}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        {/* Video / Tour */}
        {(property.videoUrl || property.virtualTourUrl) && (
          <div className="flex gap-2">
            {property.videoUrl && (
              <a
                href={property.videoUrl}
                target="_blank"
                rel="noreferrer"
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-white border border-gray-200 text-sm font-semibold text-gray-700 hover:border-indigo-400"
              >
                <PlayCircle className="w-4 h-4 text-red-500" /> Ver video
              </a>
            )}
            {property.virtualTourUrl && (
              <a
                href={property.virtualTourUrl}
                target="_blank"
                rel="noreferrer"
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-white border border-gray-200 text-sm font-semibold text-gray-700 hover:border-indigo-400"
              >
                <Rotate3D className="w-4 h-4 text-indigo-500" /> Tour 360°
              </a>
            )}
          </div>
        )}

        {/* Mapa */}
        {property.latitude != null && property.longitude != null && (
          <section className="bg-white rounded-2xl overflow-hidden border border-gray-100 shadow-sm">
            <iframe
              title="Ubicación"
              className="w-full h-64 border-0"
              loading="lazy"
              src={`https://www.google.com/maps?q=${property.latitude},${property.longitude}&z=16&output=embed`}
            />
          </section>
        )}
      </main>

      {/* CTA WhatsApp fijo */}
      <div className="fixed bottom-0 inset-x-0 bg-white/90 backdrop-blur border-t border-gray-100 p-3 z-30">
        <div className="max-w-3xl mx-auto">
          <a
            href={waHref}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-green-500 hover:bg-green-600 text-white font-bold shadow-lg shadow-green-500/30 transition-colors"
          >
            <MessageCircle className="w-5 h-5" />
            Me interesa — Contactar por WhatsApp
          </a>
        </div>
      </div>
    </div>
  );
};
