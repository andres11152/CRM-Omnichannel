import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Modal, ModalButton } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Search, MessageCircle, UserPlus, Check, Building2 } from "lucide-react";
import { getContacts, startConversationWithMessage, type CrmContact } from "@/services/crmService";
import {
  type Property,
  OPERATION_LABELS,
  KIND_LABELS,
  formatCOP,
} from "@/types/property.types";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  property: Property | null;
}

const publicUrl = (publicId: string) => `${window.location.origin}/p/${publicId}`;

/** Arma el mensaje de WhatsApp con los datos clave del inmueble + enlace de la ficha pública. */
const buildPropertyMessage = (property: Property): string => {
  // Basado en qué campos tiene datos, no en el grupo del kind — un LOTE
  // también tiene frente/fondo aunque no sea "comercial", por ejemplo.
  const specs: string[] = [];
  if (property.builtArea != null) specs.push(`${property.builtArea} m² construidos`);
  if (property.lotArea != null) specs.push(`${property.lotArea} m² de lote`);
  if (property.bedrooms != null) specs.push(`${property.bedrooms} hab.`);
  if (property.bathrooms != null) specs.push(`${property.bathrooms} baños`);
  if (property.frontage != null) specs.push(`Frente ${property.frontage} m`);
  if (property.depth != null) specs.push(`Fondo ${property.depth} m`);
  if (property.ceilingHeight != null) specs.push(`Altura ${property.ceilingHeight} m`);
  if (property.hasLoadingDock) specs.push("Muelle de carga");
  if (property.stratum != null) specs.push(`Estrato ${property.stratum}`);

  const location = [property.neighborhood, property.city].filter(Boolean).join(", ");

  const lines = [
    `*${property.title}*`,
    `${OPERATION_LABELS[property.operation]} · ${KIND_LABELS[property.kind]}`,
    `💰 ${formatCOP(property.price, property.currency)}${
      property.adminFee ? ` + ${formatCOP(property.adminFee)} admin.` : ""
    }`,
  ];
  if (specs.length) lines.push(`🏠 ${specs.join(" · ")}`);
  if (location) lines.push(`📍 ${location}`);

  // El enlace público solo es válido si el inmueble está publicado; de lo
  // contrario el destinatario recibiría un enlace roto (404).
  if (property.isPublished) {
    lines.push("", `Ver ficha completa: ${publicUrl(property.publicId)}`);
  }

  return lines.join("\n");
};

/** Normaliza a dígitos y valida longitud mínima de un número colombiano/internacional. */
const cleanPhone = (v: string) => v.replace(/\D/g, "");

export const SharePropertyModal: React.FC<Props> = ({ isOpen, onClose, property }) => {
  const navigate = useNavigate();
  const [contacts, setContacts] = useState<CrmContact[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedContact, setSelectedContact] = useState<CrmContact | null>(null);
  const [manualPhone, setManualPhone] = useState("");
  const [manualName, setManualName] = useState("");
  const [mode, setMode] = useState<"contact" | "manual">("contact");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setSelectedContact(null);
    setManualPhone("");
    setManualName("");
    setSearch("");
    setMode("contact");
    setLoadingContacts(true);
    getContacts()
      .then((r) => setContacts(r.contacts.filter((c) => !!c.phone)))
      .catch(() => toast.error("No se pudo cargar la lista de contactos."))
      .finally(() => setLoadingContacts(false));
  }, [isOpen]);

  const filteredContacts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return contacts;
    return contacts.filter(
      (c) => c.name?.toLowerCase().includes(q) || c.phone?.includes(q),
    );
  }, [contacts, search]);

  if (!property) return null;

  const targetPhone = mode === "contact" ? selectedContact?.phone : cleanPhone(manualPhone);
  const targetName = mode === "contact" ? selectedContact?.name : manualName || undefined;
  const canSend = !!targetPhone && targetPhone.length >= 10;

  const handleSend = async () => {
    if (!canSend || !targetPhone) return;
    setSending(true);
    try {
      await startConversationWithMessage({
        phone: targetPhone,
        name: targetName,
        message: buildPropertyMessage(property),
        addToContacts: mode === "manual",
      });
      toast.success(
        <span>
          Inmueble enviado a {targetName || targetPhone} por WhatsApp.{" "}
          <button className="underline font-semibold" onClick={() => navigate("/workspace")}>
            Ir a Bandeja de Entrada
          </button>
        </span>,
      );
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo enviar el mensaje");
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Enviar por WhatsApp"
      subtitle={property.title}
      icon={<MessageCircle className="w-5 h-5 text-white" />}
      size="md"
      busy={sending}
      footer={
        <>
          <ModalButton variant="secondary" onClick={onClose} disabled={sending}>
            Cancelar
          </ModalButton>
          <ModalButton
            variant="primary"
            onClick={handleSend}
            loading={sending}
            disabled={!canSend}
          >
            <MessageCircle className="w-4 h-4" /> Enviar
          </ModalButton>
        </>
      }
    >
      <div className="space-y-4">
        {!property.isPublished && (
          <p className="text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800/50 rounded-lg px-3 py-2">
            El inmueble no está publicado — se enviarán los datos, pero sin el enlace con la
            galería completa. Publícalo antes de enviar para una mejor experiencia.
          </p>
        )}

        {/* Vista previa del mensaje */}
        <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800/50 rounded-xl p-3 text-xs whitespace-pre-line text-gray-700 dark:text-gray-300 max-h-32 overflow-y-auto">
          {buildPropertyMessage(property)}
        </div>

        {/* Selector de modo */}
        <div className="flex gap-2 p-1 bg-gray-100 dark:bg-gray-800 rounded-xl">
          <button
            onClick={() => setMode("contact")}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-semibold transition-colors ${
              mode === "contact"
                ? "bg-white dark:bg-gray-700 shadow-sm text-reply-brand"
                : "text-gray-500"
            }`}
          >
            <Building2 className="w-4 h-4" /> Contacto CRM
          </button>
          <button
            onClick={() => setMode("manual")}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-semibold transition-colors ${
              mode === "manual"
                ? "bg-white dark:bg-gray-700 shadow-sm text-reply-brand"
                : "text-gray-500"
            }`}
          >
            <UserPlus className="w-4 h-4" /> Número nuevo
          </button>
        </div>

        {mode === "contact" ? (
          <div className="space-y-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar contacto por nombre o número…"
                className="pl-9"
              />
            </div>
            <div className="max-h-56 overflow-y-auto rounded-xl border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700">
              {loadingContacts ? (
                <div className="p-4 text-center text-sm text-gray-400">Cargando contactos…</div>
              ) : filteredContacts.length === 0 ? (
                <div className="p-4 text-center text-sm text-gray-400">
                  Sin contactos con número de WhatsApp
                </div>
              ) : (
                filteredContacts.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setSelectedContact(c)}
                    className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors ${
                      selectedContact?.id === c.id ? "bg-reply-brand/5" : ""
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 truncate">
                        {c.name}
                      </p>
                      <p className="text-xs text-gray-400">{c.phone}</p>
                    </div>
                    {selectedContact?.id === c.id && (
                      <Check className="w-4 h-4 text-reply-brand flex-shrink-0" />
                    )}
                  </button>
                ))
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <label className="block">
              <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">
                Número de WhatsApp
              </span>
              <Input
                value={manualPhone}
                onChange={(e) => setManualPhone(e.target.value)}
                placeholder="573001234567"
                className="mt-1"
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">
                Nombre (opcional)
              </span>
              <Input
                value={manualName}
                onChange={(e) => setManualName(e.target.value)}
                placeholder="Nombre del destinatario"
                className="mt-1"
              />
            </label>
            <p className="text-xs text-gray-400">
              Se enviará con el número de WhatsApp conectado de tu empresa y se guardará como
              nueva conversación.
            </p>
          </div>
        )}
      </div>
    </Modal>
  );
};
