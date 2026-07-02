import React, { useState } from "react";
import { toast } from "sonner";
import { Modal, ModalButton } from "@/components/ui/Modal";
import {
  Building2,
  MapPin,
  BedDouble,
  Bath,
  Car,
  Ruler,
  Link2,
  Share2,
  Pencil,
  Globe,
  EyeOff,
  Layers,
} from "lucide-react";
import {
  type Property,
  OPERATION_LABELS,
  KIND_LABELS,
  STATUS_LABELS,
  STATUS_COLORS,
  formatCOP,
} from "@/types/property.types";
import { publishProperty } from "@/services/propertyService";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  property: Property | null;
  onEdit: (p: Property) => void;
  onChanged: (p: Property) => void;
}

const publicUrl = (publicId: string) => `${window.location.origin}/p/${publicId}`;

const Spec: React.FC<{ icon: React.ReactNode; label: string; value?: React.ReactNode }> = ({
  icon,
  label,
  value,
}) =>
  value !== undefined && value !== null && value !== "" ? (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-reply-brand">{icon}</span>
      <span className="text-gray-500">{label}:</span>
      <span className="font-semibold text-gray-800 dark:text-gray-100">{value}</span>
    </div>
  ) : null;

export const PropertyDetailDrawer: React.FC<Props> = ({
  isOpen,
  onClose,
  property,
  onEdit,
  onChanged,
}) => {
  const [busy, setBusy] = useState(false);
  const [activeImg, setActiveImg] = useState(0);

  if (!property) return null;

  const cover =
    property.images.find((i) => i.isCover)?.url || property.images[0]?.url;
  const gallery = property.images.length ? property.images : [];

  const handlePublish = async () => {
    setBusy(true);
    try {
      const updated = await publishProperty(property.id, !property.isPublished);
      onChanged(updated);
      toast.success(updated.isPublished ? "Publicado" : "Despublicado");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
    } finally {
      setBusy(false);
    }
  };

  const copyLink = () => {
    navigator.clipboard.writeText(publicUrl(property.publicId));
    toast.success("Enlace público copiado");
  };

  const shareWhatsApp = () => {
    const text = `*${property.title}*\n${OPERATION_LABELS[property.operation]} · ${formatCOP(
      property.price,
      property.currency,
    )}\n${property.city ?? ""}${property.neighborhood ? ", " + property.neighborhood : ""}\n\nVer ficha: ${publicUrl(
      property.publicId,
    )}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={property.reference}
      subtitle={property.title}
      icon={<Building2 className="w-5 h-5 text-white" />}
      size="lg"
      footer={
        <>
          <ModalButton variant="secondary" onClick={() => onEdit(property)}>
            <Pencil className="w-4 h-4" /> Editar
          </ModalButton>
          <ModalButton
            variant={property.isPublished ? "danger" : "primary"}
            onClick={handlePublish}
            loading={busy}
          >
            {property.isPublished ? (
              <>
                <EyeOff className="w-4 h-4" /> Despublicar
              </>
            ) : (
              <>
                <Globe className="w-4 h-4" /> Publicar
              </>
            )}
          </ModalButton>
        </>
      }
    >
      <div className="space-y-4">
        {/* Galería */}
        {cover ? (
          <div>
            <div className="aspect-video rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-800">
              <img
                src={gallery[activeImg]?.url || cover}
                alt={property.title}
                className="w-full h-full object-cover"
              />
            </div>
            {gallery.length > 1 && (
              <div className="flex gap-1.5 mt-2 overflow-x-auto">
                {gallery.map((img, i) => (
                  <img
                    key={img.id}
                    src={img.url}
                    onClick={() => setActiveImg(i)}
                    className={`h-14 w-20 object-cover rounded cursor-pointer flex-shrink-0 ${
                      i === activeImg ? "ring-2 ring-reply-brand" : "opacity-70"
                    }`}
                  />
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="aspect-video rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-400">
            Sin fotos
          </div>
        )}

        {/* Precio + estado */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <span className="text-2xl font-black text-reply-brand">
              {formatCOP(property.price, property.currency)}
            </span>
            {property.adminFee ? (
              <span className="text-sm text-gray-500 ml-2">
                + {formatCOP(property.adminFee)} admin.
              </span>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-xs font-bold px-2 py-1 rounded-full ${STATUS_COLORS[property.status]}`}>
              {STATUS_LABELS[property.status]}
            </span>
            <span className="text-xs font-semibold px-2 py-1 rounded-full bg-reply-brand/10 text-reply-brand">
              {OPERATION_LABELS[property.operation]} · {KIND_LABELS[property.kind]}
            </span>
          </div>
        </div>

        {/* Specs */}
        <div className="grid grid-cols-2 gap-2 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-xl">
          <Spec icon={<BedDouble className="w-4 h-4" />} label="Habitaciones" value={property.bedrooms} />
          <Spec icon={<Bath className="w-4 h-4" />} label="Baños" value={property.bathrooms} />
          <Spec icon={<Car className="w-4 h-4" />} label="Parqueaderos" value={property.parkingSpots} />
          <Spec icon={<Ruler className="w-4 h-4" />} label="Área" value={property.builtArea ? `${property.builtArea} m²` : undefined} />
          <Spec icon={<Layers className="w-4 h-4" />} label="Estrato" value={property.stratum} />
          <Spec icon={<MapPin className="w-4 h-4" />} label="Ubicación" value={[property.neighborhood, property.city].filter(Boolean).join(", ")} />
        </div>

        {property.description && (
          <p className="text-sm text-gray-600 dark:text-gray-300 whitespace-pre-line">
            {property.description}
          </p>
        )}

        {/* Amenidades */}
        {(property.features.length > 0 || property.amenities.length > 0) && (
          <div className="flex flex-wrap gap-1.5">
            {[...property.features, ...property.amenities].map((f) => (
              <span
                key={f}
                className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300"
              >
                {f}
              </span>
            ))}
          </div>
        )}

        {/* Acciones de compartir */}
        <div className="flex items-center gap-2 pt-2 border-t border-gray-100 dark:border-gray-700">
          <button
            onClick={copyLink}
            disabled={!property.isPublished}
            title={property.isPublished ? "Copiar enlace público" : "Publica primero para compartir"}
            className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-40"
          >
            <Link2 className="w-4 h-4" /> Copiar enlace
          </button>
          <button
            onClick={shareWhatsApp}
            disabled={!property.isPublished}
            className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg bg-green-500 text-white hover:bg-green-600 disabled:opacity-40"
          >
            <Share2 className="w-4 h-4" /> WhatsApp
          </button>
          {property.isPublished && (
            <span className="text-xs text-gray-400 ml-auto">{property.viewsCount} vistas</span>
          )}
        </div>
      </div>
    </Modal>
  );
};
