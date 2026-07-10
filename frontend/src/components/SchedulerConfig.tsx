import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useAuthStore } from "@/stores/authStore";
import { api } from "@/lib/axios";
import {
  getAvailability,
  saveAvailability,
  getMeetingTypes,
  createMeetingType,
  updateMeetingType,
  deleteMeetingType,
  MeetingType,
  AvailabilityRule,
} from "@/services/schedulerService";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal, ModalButton } from "@/components/ui/Modal";
import {
  Calendar,
  Clock,
  Plus,
  Trash2,
  Edit2,
  Copy,
  Check,
  Globe,
  Settings,
  Link,
  ChevronRight,
  AlertCircle,
  ExternalLink,
} from "lucide-react";

export const SchedulerConfig: React.FC = () => {
  const { t } = useTranslation();
  const user = useAuthStore((state) => state.user);

  const [loading, setLoading] = useState(false);
  const [savingAvailability, setSavingAvailability] = useState(false);
  const [savingMeetingType, setSavingMeetingType] = useState(false);

  // Availability Configuration State
  const [timezone, setTimezone] = useState("America/Bogota");
  const [rules, setRules] = useState<AvailabilityRule[]>([
    { day: 1, slots: [{ start: "09:00", end: "17:00" }] },
    { day: 2, slots: [{ start: "09:00", end: "17:00" }] },
    { day: 3, slots: [{ start: "09:00", end: "17:00" }] },
    { day: 4, slots: [{ start: "09:00", end: "17:00" }] },
    { day: 5, slots: [{ start: "09:00", end: "17:00" }] },
  ]);

  // Meeting Types State
  const [meetingTypes, setMeetingTypes] = useState<MeetingType[]>([]);
  const [isMTModalOpen, setIsMTModalOpen] = useState(false);
  const [editingMT, setEditingMT] = useState<MeetingType | null>(null);
  const [mtFormData, setMTFormData] = useState({
    name: "",
    slug: "",
    description: "",
    duration: 30,
    isActive: true,
  });

  // UI States
  const [copiedLink, setCopiedLink] = useState<string | null>(null);
  const [isGoogleConnected, setIsGoogleConnected] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      // 1. Fetch Availability
      const avail = await getAvailability();
      if (avail) {
        setTimezone(avail.timezone || "America/Bogota");
        if (avail.rules && avail.rules.length > 0) {
          setRules(avail.rules);
        }
      }

      // 2. Fetch Meeting Types
      const types = await getMeetingTypes();
      setMeetingTypes(types);

      // 3. Check Google Calendar Status (endpoint protegido y dedicado)
      const statusRes = await api.get("/google/status");
      const statusData = statusRes.data.data || statusRes.data;
      setIsGoogleConnected(!!statusData.connected);
    } catch (error) {
      console.error("Error loading scheduling config:", error);
      toast.error("Error al cargar la configuración de citas.");
    } finally {
      setLoading(false);
    }
  };

  const handleConnectGoogle = async () => {
    try {
      // Pide la URL de consentimiento al endpoint protegido (auth por Bearer);
      // el state va firmado en el backend. Luego redirige directo a Google.
      const res = await api.get("/google/auth-url");
      const url = (res.data?.data?.url || res.data?.url) as string | undefined;
      if (url) {
        window.location.href = url;
      } else {
        toast.error("No se pudo iniciar la conexión con Google");
      }
    } catch (error) {
      console.error("Failed to start Google Calendar connect:", error);
      toast.error("Error al conectar Google Calendar");
    }
  };

  const handleDisconnectGoogle = async () => {
    try {
      await api.post("/google/disconnect");
      setIsGoogleConnected(false);
      toast.success("Google Calendar desvinculado");
    } catch (error) {
      console.error("Failed to disconnect Google Calendar:", error);
      toast.error("Error al desvincular Google Calendar");
    }
  };

  const handleSaveAvailability = async () => {
    setSavingAvailability(true);
    try {
      await saveAvailability({ timezone, rules });
      toast.success("Disponibilidad horaria guardada con éxito.");
    } catch (error) {
      console.error("Error saving availability:", error);
      toast.error("No se pudo guardar la disponibilidad.");
    } finally {
      setSavingAvailability(false);
    }
  };

  const handleOpenMTModal = (mt?: MeetingType) => {
    if (mt) {
      setEditingMT(mt);
      setMTFormData({
        name: mt.name,
        slug: mt.slug,
        description: mt.description || "",
        duration: mt.duration,
        isActive: mt.isActive,
      });
    } else {
      setEditingMT(null);
      setMTFormData({
        name: "",
        slug: "",
        description: "",
        duration: 30,
        isActive: true,
      });
    }
    setIsMTModalOpen(true);
  };

  const handleSaveMeetingType = async () => {
    if (!mtFormData.name.trim() || !mtFormData.slug.trim()) {
      return toast.error("El nombre y el enlace (slug) son obligatorios.");
    }

    setSavingMeetingType(true);
    try {
      if (editingMT) {
        const updated = await updateMeetingType(editingMT.id, mtFormData);
        setMeetingTypes((prev) => prev.map((t) => (t.id === editingMT.id ? updated : t)));
        toast.success("Tipo de reunión actualizado.");
      } else {
        const created = await createMeetingType(mtFormData);
        setMeetingTypes((prev) => [...prev, created]);
        toast.success("Tipo de reunión creado con éxito.");
      }
      setIsMTModalOpen(false);
    } catch (error: any) {
      console.error("Error saving meeting type:", error);
      toast.error(error.response?.data?.message || "No se pudo guardar el tipo de reunión.");
    } finally {
      setSavingMeetingType(false);
    }
  };

  const handleDeleteMeetingType = async (id: string) => {
    if (!confirm("¿Estás seguro de eliminar este tipo de reunión?")) return;
    try {
      await deleteMeetingType(id);
      setMeetingTypes((prev) => prev.filter((t) => t.id !== id));
      toast.success("Tipo de reunión eliminado.");
    } catch (error) {
      console.error("Error deleting meeting type:", error);
      toast.error("No se pudo eliminar el tipo de reunión.");
    }
  };

  const handleCopyLink = (slug: string) => {
    const companySlug = user?.company?.slug || user?.companyId;
    const agentSlug = user?.email;
    const link = `${window.location.origin}/book/${companySlug}/${agentSlug}/${slug}`;
    
    navigator.clipboard.writeText(link).then(() => {
      setCopiedLink(slug);
      toast.success("Enlace de reserva copiado al portapapeles.");
      setTimeout(() => setCopiedLink(null), 3000);
    });
  };

  const handleToggleDay = (day: number) => {
    setRules((prev) => {
      const exists = prev.some((r) => r.day === day);
      if (exists) {
        return prev.filter((r) => r.day !== day);
      } else {
        return [...prev, { day, slots: [{ start: "09:00", end: "17:00" }] }].sort((a, b) => a.day - b.day);
      }
    });
  };

  const handleSlotChange = (day: number, index: number, field: "start" | "end", value: string) => {
    setRules((prev) =>
      prev.map((r) => {
        if (r.day === day) {
          const updatedSlots = [...r.slots];
          updatedSlots[index] = { ...updatedSlots[index], [field]: value };
          return { ...r, slots: updatedSlots };
        }
        return r;
      })
    );
  };

  const handleAddSlot = (day: number) => {
    setRules((prev) =>
      prev.map((r) => {
        if (r.day === day) {
          return { ...r, slots: [...r.slots, { start: "14:00", end: "18:00" }] };
        }
        return r;
      })
    );
  };

  const handleRemoveSlot = (day: number, index: number) => {
    setRules((prev) =>
      prev.map((r) => {
        if (r.day === day) {
          return { ...r, slots: r.slots.filter((_, i) => i !== index) };
        }
        return r;
      })
    );
  };

  const daysOfWeek = [
    { label: "Domingo", value: 0 },
    { label: "Lunes", value: 1 },
    { label: "Martes", value: 2 },
    { label: "Miércoles", value: 3 },
    { label: "Jueves", value: 4 },
    { label: "Viernes", value: 5 },
    { label: "Sábado", value: 6 },
  ];

  const timezones = [
    "America/Bogota",
    "America/Mexico_City",
    "America/Santiago",
    "America/Buenos_Aires",
    "America/Lima",
    "America/Caracas",
    "America/Madrid",
    "UTC",
  ];

  return (
    <div className="space-y-8 max-w-5xl mx-auto p-4 md:p-8">
      {/* Google Calendar Connection Status Banner */}
      <Card className="p-6 border-l-4 border-l-indigo-600 shadow-md">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 rounded-2xl">
              <Calendar className="w-8 h-8" />
            </div>
            <div>
              <h3 className="font-bold text-gray-900 dark:text-white">
                Sincronización con Google Calendar
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 font-semibold mt-0.5">
                {isGoogleConnected
                  ? "Conectado. Buscaremos conflictos de horarios automáticamente."
                  : "Conecta tu calendario de Google para evitar reservas duplicadas."}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {isGoogleConnected && (
              <button
                onClick={handleDisconnectGoogle}
                className="text-sm text-rose-600 hover:text-rose-700 font-bold"
              >
                Desconectar
              </button>
            )}
            <Button
              onClick={handleConnectGoogle}
              variant={isGoogleConnected ? "secondary" : "primary"}
              className="flex items-center gap-2"
            >
              {isGoogleConnected ? "Reconectar Calendario" : "Conectar Calendario"}
              <ExternalLink className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Availability rules (Left 2/3 on desktop) */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="p-6 space-y-6">
            <div className="flex justify-between items-center pb-4 border-b border-gray-200 dark:border-reply-border-dark">
              <h3 className="text-lg font-bold text-gray-800 dark:text-white flex items-center gap-2">
                <Clock className="w-5 h-5 text-indigo-500" />
                Horarios de Disponibilidad
              </h3>
              <Button
                onClick={handleSaveAvailability}
                isLoading={savingAvailability}
                disabled={loading}
              >
                Guardar Horarios
              </Button>
            </div>

            {/* Timezone Config */}
            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
              <label className="text-sm font-bold text-gray-700 dark:text-gray-300 flex items-center gap-1.5 shrink-0">
                <Globe className="w-4 h-4" /> Zona Horaria:
              </label>
              <select
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="w-full sm:w-64 appearance-none bg-reply-bg/20 dark:bg-white/5 border border-gray-300 dark:border-reply-border-dark rounded-xl px-4 py-2 text-sm font-medium outline-none cursor-pointer text-gray-900 dark:text-white"
              >
                {timezones.map((tz) => (
                  <option key={tz} value={tz} className="bg-white dark:bg-reply-panel-dark">
                    {tz}
                  </option>
                ))}
              </select>
            </div>

            {/* Availability Days List */}
            <div className="space-y-4 pt-4">
              {daysOfWeek.map((day) => {
                const rule = rules.find((r) => r.day === day.value);
                const isEnabled = !!rule;

                return (
                  <div
                    key={day.value}
                    className="flex flex-col sm:flex-row gap-4 sm:items-center p-3 rounded-xl border border-gray-100 dark:border-reply-border-dark hover:bg-gray-50 dark:hover:bg-reply-bg-dark/20 transition-colors"
                  >
                    {/* Checkbox / Toggle Toggle */}
                    <div className="flex items-center gap-3 w-40 shrink-0">
                      <input
                        type="checkbox"
                        checked={isEnabled}
                        onChange={() => handleToggleDay(day.value)}
                        className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4 cursor-pointer"
                      />
                      <span className="text-sm font-bold text-gray-800 dark:text-gray-200">
                        {day.label}
                      </span>
                    </div>

                    {/* Time Slots for the Day */}
                    {isEnabled && rule ? (
                      <div className="flex-1 space-y-2">
                        {rule.slots.map((slot, idx) => (
                          <div key={idx} className="flex items-center gap-2 flex-wrap">
                            <input
                              type="time"
                              value={slot.start}
                              onChange={(e) =>
                                handleSlotChange(day.value, idx, "start", e.target.value)
                              }
                              className="px-2 py-1 rounded-md border border-gray-300 dark:border-reply-border-dark bg-white dark:bg-reply-border-dark text-sm outline-none text-gray-900 dark:text-white"
                            />
                            <span className="text-gray-400 text-xs font-bold">a</span>
                            <input
                              type="time"
                              value={slot.end}
                              onChange={(e) =>
                                handleSlotChange(day.value, idx, "end", e.target.value)
                              }
                              className="px-2 py-1 rounded-md border border-gray-300 dark:border-reply-border-dark bg-white dark:bg-reply-border-dark text-sm outline-none text-gray-900 dark:text-white"
                            />

                            {/* Remove Slot */}
                            {rule.slots.length > 1 && (
                              <button
                                onClick={() => handleRemoveSlot(day.value, idx)}
                                className="text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/20 p-1 rounded-md transition-colors"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        ))}

                        {/* Add Slot Button */}
                        <button
                          onClick={() => handleAddSlot(day.value)}
                          className="text-xs text-indigo-600 hover:underline flex items-center gap-1 font-bold"
                        >
                          <Plus className="w-3.5 h-3.5" /> Agregar otro horario
                        </button>
                      </div>
                    ) : (
                      <span className="text-sm text-gray-400 italic font-semibold">
                        No disponible
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>
        </div>

        {/* Meeting types sidebar list */}
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-bold text-gray-800 dark:text-white flex items-center gap-2">
              Tipos de Reuniones
            </h3>
            <Button size="sm" onClick={() => handleOpenMTModal()}>
              <Plus className="w-4 h-4" /> Nuevo
            </Button>
          </div>

          <div className="space-y-4">
            {meetingTypes.length === 0 ? (
              <Card className="p-8 text-center text-gray-400 border-2 border-dashed border-gray-200 dark:border-reply-border-dark">
                No tienes tipos de reuniones creados.
              </Card>
            ) : (
              meetingTypes.map((type) => (
                <Card key={type.id} className="p-5 space-y-4 relative group">
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="font-bold text-gray-900 dark:text-white group-hover:text-indigo-600 transition-colors">
                        {type.name}
                      </h4>
                      <p className="text-[11px] font-mono text-gray-400 dark:text-gray-500 mt-0.5">
                        /{type.slug}
                      </p>
                    </div>
                    <span className="text-xs font-semibold px-2 py-0.5 bg-indigo-50 dark:bg-indigo-950/20 text-indigo-600 dark:text-indigo-400 rounded-full border border-indigo-200/50">
                      {type.duration} min
                    </span>
                  </div>

                  <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">
                    {type.description || "Sin descripción."}
                  </p>

                  <div className="flex justify-between items-center pt-3 border-t border-gray-100 dark:border-reply-border-dark">
                    {/* Actions */}
                    <div className="flex items-center gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleOpenMTModal(type)}
                        className="p-1.5"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleDeleteMeetingType(type.id)}
                        className="p-1.5 hover:text-rose-500"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>

                    {/* Copy Public Link */}
                    <button
                      onClick={() => handleCopyLink(type.slug)}
                      className="text-xs font-bold text-gray-500 hover:text-indigo-600 flex items-center gap-1"
                    >
                      {copiedLink === type.slug ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-green-600" /> Copiado
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" /> Copiar Enlace
                        </>
                      )}
                    </button>
                  </div>
                </Card>
              ))
            )}
          </div>
        </div>
      </div>

      {/* CREATE / EDIT MEETING TYPE MODAL */}
      <Modal
        isOpen={isMTModalOpen}
        onClose={() => setIsMTModalOpen(false)}
        title={editingMT ? "Editar Tipo de Reunión" : "Crear Tipo de Reunión"}
        icon={<Settings className="w-5 h-5" />}
        size="md"
        busy={savingMeetingType}
        footer={
          <>
            <ModalButton variant="secondary" onClick={() => setIsMTModalOpen(false)}>
              Cancelar
            </ModalButton>
            <ModalButton variant="primary" onClick={handleSaveMeetingType} loading={savingMeetingType}>
              {editingMT ? "Actualizar" : "Crear Tipo"}
            </ModalButton>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            id="mt-name"
            label="Nombre de la Reunión"
            type="text"
            value={mtFormData.name}
            onChange={(e) => {
              const val = e.target.value;
              const generatedSlug = val
                .toLowerCase()
                .trim()
                .replace(/[^\w\s-]/g, "")
                .replace(/[\s_]+/g, "-");
              
              setMTFormData((prev) => ({
                ...prev,
                name: val,
                // Only auto-fill slug if it hasn't been edited manually yet
                slug: editingMT ? prev.slug : generatedSlug,
              }));
            }}
            placeholder="Ej: Demo Comercial 1-a-1"
          />

          <Input
            id="mt-slug"
            label="Enlace Amigable (Slug)"
            type="text"
            value={mtFormData.slug}
            onChange={(e) => setMTFormData((prev) => ({ ...prev, slug: e.target.value }))}
            placeholder="ej-demo-comercial"
          />

          <div>
            <label className="block text-xs font-black text-gray-700 dark:text-gray-300 uppercase tracking-widest mb-1.5">
              Duración (Minutos)
            </label>
            <select
              value={mtFormData.duration}
              onChange={(e) => setMTFormData((prev) => ({ ...prev, duration: Number(e.target.value) }))}
              className="w-full bg-reply-bg/20 dark:bg-white/5 border border-gray-300 dark:border-reply-border-dark rounded-xl px-4 py-3 text-sm font-medium outline-none text-gray-900 dark:text-white"
            >
              <option value={15} className="bg-white dark:bg-reply-panel-dark">15 minutos</option>
              <option value={30} className="bg-white dark:bg-reply-panel-dark">30 minutos</option>
              <option value={45} className="bg-white dark:bg-reply-panel-dark">45 minutos</option>
              <option value={60} className="bg-white dark:bg-reply-panel-dark">60 minutos</option>
              <option value={90} className="bg-white dark:bg-reply-panel-dark">90 minutos</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-black text-gray-700 dark:text-gray-300 uppercase tracking-widest mb-1.5">
              Descripción
            </label>
            <textarea
              value={mtFormData.description}
              onChange={(e) => setMTFormData((prev) => ({ ...prev, description: e.target.value }))}
              placeholder="Explica brevemente de qué trata esta reunión o qué información debe preparar el cliente."
              className="w-full bg-reply-bg/20 dark:bg-white/5 border border-gray-300 dark:border-reply-border-dark rounded-xl px-4 py-3 text-sm font-medium outline-none resize-none h-24 text-gray-900 dark:text-white"
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="mt-isActive"
              checked={mtFormData.isActive}
              onChange={(e) => setMTFormData((prev) => ({ ...prev, isActive: e.target.checked }))}
              className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4 cursor-pointer"
            />
            <label htmlFor="mt-isActive" className="text-sm font-bold text-gray-800 dark:text-gray-200 cursor-pointer">
              Tipo de reunión activo (Habilita reservas públicas)
            </label>
          </div>
        </div>
      </Modal>
    </div>
  );
};
