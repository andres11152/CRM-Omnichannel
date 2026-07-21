import React, { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { getAvailableSlots, bookMeeting } from "@/services/schedulerService";
import { api } from "@/lib/axios";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import {
  Calendar as CalendarIcon,
  Clock,
  User,
  Mail,
  Phone,
  MessageSquare,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  Globe,
} from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

export const PublicBookingPage: React.FC = () => {
  const { t } = useTranslation();
  const { companySlug, agentSlug, meetingTypeSlug } = useParams<{
    companySlug: string;
    agentSlug: string;
    meetingTypeSlug: string;
  }>();

  // Resolving metadata states
  const [loadingMetadata, setLoadingMetadata] = useState(true);
  const [meetingTypeInfo, setMeetingTypeInfo] = useState<{
    name: string;
    description: string | null;
    duration: number;
    agentName: string;
    companyName: string;
    companyId: string;
    agentId: string;
  } | null>(null);

  // Calendar dates states
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [slots, setSlots] = useState<string[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);

  // Booking Form State
  const [bookingForm, setBookingForm] = useState({
    guestName: "",
    guestEmail: "",
    guestPhone: "",
    guestNotes: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [bookingSuccess, setBookingSuccess] = useState<{
    agentName: string;
    meetingName: string;
    startTime: string;
  } | null>(null);

  // Load meeting metadata on mount
  useEffect(() => {
    const fetchMetadata = async () => {
      setLoadingMetadata(true);
      try {
        // We call a public resolver endpoint to find the details of this booking URL
        const res = await api.get(
          `/scheduler/slots/info?companySlug=${companySlug}&agentSlug=${agentSlug}&meetingTypeSlug=${meetingTypeSlug}`
        );
        setMeetingTypeInfo(res.data.data);
      } catch (error) {
        console.error("Error loading booking details:", error);
        toast.error(t("public_booking_page.toast.invalid_link", "Este enlace de citas no es válido o ha expirado."));
      } finally {
        setLoadingMetadata(false);
      }
    };
    fetchMetadata();
  }, [companySlug, agentSlug, meetingTypeSlug]);

  // Load slots when selected date changes
  useEffect(() => {
    if (!selectedDate || !meetingTypeInfo) return;

    const fetchSlots = async () => {
      setLoadingSlots(true);
      try {
        const formattedDate = selectedDate.toISOString().split("T")[0];
        const available = await getAvailableSlots(
          meetingTypeInfo.companyId,
          meetingTypeInfo.agentId,
          meetingTypeSlug || "",
          formattedDate
        );
        setSlots(available);
        setSelectedSlot(null);
      } catch (error) {
        console.error("Error loading slots:", error);
        toast.error(t("public_booking_page.toast.slots_load_error", "No se pudieron cargar los horarios disponibles."));
      } finally {
        setLoadingSlots(false);
      }
    };
    fetchSlots();
  }, [selectedDate, meetingTypeInfo, meetingTypeSlug]);

  const handleBook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSlot || !meetingTypeInfo) return;

    if (!bookingForm.guestName.trim() || !bookingForm.guestEmail.trim()) {
      return toast.error(t("public_booking_page.toast.name_email_required", "El nombre y el correo electrónico son obligatorios."));
    }

    setSubmitting(true);
    try {
      const result = await bookMeeting({
        companyId: meetingTypeInfo.companyId,
        agentSlugOrId: meetingTypeInfo.agentId,
        meetingTypeSlug: meetingTypeSlug || "",
        startTime: selectedSlot,
        guestName: bookingForm.guestName.trim(),
        guestEmail: bookingForm.guestEmail.trim(),
        guestPhone: bookingForm.guestPhone.trim() || undefined,
        guestNotes: bookingForm.guestNotes.trim() || undefined,
      });

      setBookingSuccess(result);
      toast.success(t("public_booking_page.toast.booked_success", "¡Cita reservada correctamente!"));
    } catch (error) {
      console.error("Error making booking:", error);
      toast.error(t("public_booking_page.toast.booking_error", "No se pudo agendar la cita. Por favor intenta con otro horario."));
    } finally {
      setSubmitting(false);
    }
  };

  // Calendar Grid generation logic
  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysCount = new Date(year, month + 1, 0).getDate();

    const days = [];
    // Padding for first week
    for (let i = 0; i < firstDay; i++) {
      days.push(null);
    }
    // Days numbers
    for (let i = 1; i <= daysCount; i++) {
      days.push(new Date(year, month, i));
    }
    return days;
  };

  const handlePrevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  const isToday = (date: Date) => {
    const today = new Date();
    return (
      date.getDate() === today.getDate() &&
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear()
    );
  };

  const isBeforeToday = (date: Date) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return date.getTime() < today.getTime();
  };

  const formatSlotTime = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: true });
  };

  if (loadingMetadata) {
    return (
      <div className="min-h-screen flex justify-center items-center bg-gray-50 dark:bg-reply-bg-dark">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600" />
      </div>
    );
  }

  if (!meetingTypeInfo) {
    return (
      <div className="min-h-screen flex flex-col justify-center items-center bg-gray-50 dark:bg-reply-bg-dark p-6 text-center">
        <AlertTriangle className="w-16 h-16 text-rose-500 mb-4" />
        <h2 className="text-xl font-bold text-gray-800 dark:text-white">
          Enlace de citas no disponible
        </h2>
        <p className="text-gray-500 mt-2 max-w-sm">
          Este enlace de reserva no existe o el agente ha suspendido este tipo de reunión.
        </p>
      </div>
    );
  }

  // Booking Confirmation View
  if (bookingSuccess) {
    const localTime = new Date(bookingSuccess.startTime).toLocaleString([], {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });

    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-reply-bg-dark p-4">
        <Card className="w-full max-w-lg p-8 space-y-6 text-center shadow-xl">
          <div className="w-20 h-20 bg-green-50 dark:bg-green-950/20 text-green-600 rounded-full flex items-center justify-center mx-auto border border-green-200 dark:border-green-800">
            <CheckCircle className="w-12 h-12" />
          </div>

          <div className="space-y-2">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
              ¡Cita Confirmada!
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 font-semibold">
              Se ha enviado una invitación por correo electrónico con los detalles del enlace de Google Meet.
            </p>
          </div>

          <div className="bg-gray-50 dark:bg-white/5 rounded-2xl p-5 border border-gray-100 dark:border-reply-border-dark text-left space-y-3 font-semibold">
            <div>
              <span className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wider block">Reunión</span>
              <span className="text-sm text-gray-800 dark:text-gray-200">{bookingSuccess.meetingName}</span>
            </div>
            <div>
              <span className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wider block">Anfitrión</span>
              <span className="text-sm text-gray-800 dark:text-gray-200">{bookingSuccess.agentName} ({meetingTypeInfo.companyName})</span>
            </div>
            <div>
              <span className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wider block">Fecha y Hora</span>
              <span className="text-sm text-indigo-600 dark:text-indigo-400 capitalize">{localTime}</span>
            </div>
          </div>

          <p className="text-xs text-gray-400">
            ¿Necesitas reprogramar? Ponte en contacto con el anfitrión de la reunión.
          </p>
        </Card>
      </div>
    );
  }

  const days = getDaysInMonth(currentDate);
  const monthName = currentDate.toLocaleString("default", { month: "long" });

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-reply-bg-dark py-12 px-4 flex justify-center items-center">
      <Card className="w-full max-w-4xl shadow-xl overflow-hidden flex flex-col md:flex-row min-h-[500px]">
        {/* Left Side: Host & Meeting Details */}
        <div className="md:w-1/3 bg-reply-bg/50 dark:bg-reply-panel-dark/50 border-r border-gray-200 dark:border-reply-border-dark p-6 md:p-8 flex flex-col justify-between">
          <div className="space-y-6">
            <div>
              <span className="text-xs font-black text-indigo-600 uppercase tracking-wider bg-indigo-50 dark:bg-indigo-950/20 px-2 py-0.5 rounded border border-indigo-200/50">
                {meetingTypeInfo.companyName}
              </span>
              <h1 className="text-xl font-bold text-gray-900 dark:text-white mt-3">
                {meetingTypeInfo.name}
              </h1>
              <p className="text-xs text-gray-500 mt-1 font-bold">
                Anfitrión: {meetingTypeInfo.agentName}
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300 font-semibold">
                <Clock className="w-4 h-4 text-gray-400" />
                {meetingTypeInfo.duration} minutos
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300 font-semibold">
                <Globe className="w-4 h-4 text-gray-400" />
                Zona de cliente (local)
              </div>
            </div>

            {meetingTypeInfo.description && (
              <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed font-semibold">
                {meetingTypeInfo.description}
              </p>
            )}
          </div>

          <p className="text-[10px] text-gray-400 mt-8 font-semibold">
            Desarrollado por Reply CRM Omnicanal
          </p>
        </div>

        {/* Right Side: Step 1 Date & Time Selector */}
        {!selectedSlot ? (
          <div className="md:w-2/3 p-6 md:p-8 flex flex-col md:flex-row gap-6">
            {/* Calendar */}
            <div className="flex-1 space-y-4">
              <h3 className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <CalendarIcon className="w-5 h-5 text-indigo-500" />
                Selecciona Fecha
              </h3>

              <div className="flex justify-between items-center bg-gray-100/50 dark:bg-white/5 rounded-xl px-3 py-2">
                <span className="text-sm font-bold text-gray-800 dark:text-gray-200 capitalize">
                  {monthName} {currentDate.getFullYear()}
                </span>
                <div className="flex gap-1">
                  <button onClick={handlePrevMonth} className="p-1 text-gray-500 hover:text-gray-800 dark:hover:text-white">
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <button onClick={handleNextMonth} className="p-1 text-gray-500 hover:text-gray-800 dark:hover:text-white">
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Calendar Grid */}
              <div className="grid grid-cols-7 gap-1 text-center font-bold">
                {["D", "L", "M", "M", "J", "V", "S"].map((d, i) => (
                  <span key={i} className="text-xs text-gray-400 dark:text-gray-500 py-1">
                    {d}
                  </span>
                ))}

                {days.map((day, idx) => {
                  if (!day) return <span key={idx} />;

                  const past = isBeforeToday(day);
                  const isSelected =
                    selectedDate &&
                    day.getDate() === selectedDate.getDate() &&
                    day.getMonth() === selectedDate.getMonth();

                  return (
                    <button
                      key={idx}
                      disabled={past}
                      onClick={() => setSelectedDate(day)}
                      className={`h-9 w-9 mx-auto rounded-full text-xs transition-colors flex items-center justify-center cursor-pointer ${
                        past
                          ? "text-gray-300 dark:text-gray-700 pointer-events-none"
                          : isSelected
                            ? "bg-indigo-600 text-white font-bold"
                            : isToday(day)
                              ? "bg-indigo-50 dark:bg-indigo-950/20 text-indigo-600 font-bold border border-indigo-200"
                              : "text-gray-800 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/5"
                      }`}
                    >
                      {day.getDate()}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Time Slot Picker */}
            <div className="w-full md:w-56 flex flex-col gap-4">
              <h3 className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <Clock className="w-5 h-5 text-indigo-500" />
                Horarios Disponibles
              </h3>

              {!selectedDate ? (
                <div className="flex-1 flex items-center justify-center text-center text-gray-400 text-xs p-6 bg-gray-50 dark:bg-white/5 rounded-2xl border border-dashed border-gray-200 dark:border-reply-border-dark">
                  Elige un día en el calendario para ver horarios.
                </div>
              ) : loadingSlots ? (
                <div className="flex-1 flex items-center justify-center">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600" />
                </div>
              ) : slots.length === 0 ? (
                <div className="flex-1 flex items-center justify-center text-center text-gray-400 text-xs p-6 bg-gray-50 dark:bg-white/5 rounded-2xl border border-dashed border-gray-200 dark:border-reply-border-dark">
                  No hay horarios disponibles para este día.
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto max-h-[300px] space-y-2 pr-1 custom-scrollbar">
                  {slots.map((slot) => (
                    <button
                      key={slot}
                      onClick={() => setSelectedSlot(slot)}
                      className="w-full py-2.5 px-4 text-xs font-bold text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800/40 rounded-xl hover:bg-indigo-600 hover:text-white transition-colors cursor-pointer"
                    >
                      {formatSlotTime(slot)}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          /* Step 2: Form Input for Booking Details */
          <form onSubmit={handleBook} className="md:w-2/3 p-6 md:p-8 flex flex-col justify-between">
            <div className="space-y-6">
              <div className="flex items-center gap-2 pb-4 border-b border-gray-200 dark:border-reply-border-dark">
                <button
                  type="button"
                  onClick={() => setSelectedSlot(null)}
                  className="p-1 hover:bg-gray-100 dark:hover:bg-white/5 rounded-lg text-gray-500 hover:text-gray-800 dark:hover:text-white transition-colors"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <div>
                  <h3 className="font-bold text-gray-950 dark:text-white text-base">
                    Detalles de Reserva
                  </h3>
                  <p className="text-xs text-indigo-600 dark:text-indigo-400 capitalize mt-0.5 font-bold flex items-center gap-1">
                    <CalendarIcon className="w-3.5 h-3.5" />
                    <span>
                      {new Date(selectedSlot).toLocaleString([], { weekday: "long", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  id="guest-name"
                  label="Nombre Completo *"
                  type="text"
                  value={bookingForm.guestName}
                  onChange={(e) => setBookingForm({ ...bookingForm, guestName: e.target.value })}
                  placeholder="Ej: Andres Betancourt"
                  icon={<User className="h-5 w-5 text-gray-400" />}
                  required
                />

                <Input
                  id="guest-email"
                  label="Correo Electrónico *"
                  type="email"
                  value={bookingForm.guestEmail}
                  onChange={(e) => setBookingForm({ ...bookingForm, guestEmail: e.target.value })}
                  placeholder="ejemplo@correo.com"
                  icon={<Mail className="h-5 w-5 text-gray-400" />}
                  required
                />

                <div className="sm:col-span-2">
                  <Input
                    id="guest-phone"
                    label="Teléfono / WhatsApp"
                    type="tel"
                    value={bookingForm.guestPhone}
                    onChange={(e) => setBookingForm({ ...bookingForm, guestPhone: e.target.value })}
                    placeholder="Ej: +57 300 123 4567"
                    icon={<Phone className="h-5 w-5 text-gray-400" />}
                  />
                </div>

                <div className="sm:col-span-2 space-y-1.5">
                  <label htmlFor="guest-notes" className="text-xs font-black text-gray-500 uppercase tracking-widest">
                    Notas adicionales
                  </label>
                  <div className="relative">
                    <textarea
                      id="guest-notes"
                      value={bookingForm.guestNotes}
                      onChange={(e) => setBookingForm({ ...bookingForm, guestNotes: e.target.value })}
                      placeholder="Indica de qué te gustaría conversar o proporciona detalles de contexto..."
                      className="w-full bg-reply-bg/20 dark:bg-white/5 border border-gray-300 dark:border-reply-border-dark rounded-xl pl-11 pr-4 py-3 text-sm font-medium outline-none resize-none h-24 text-gray-900 dark:text-white"
                    />
                    <MessageSquare className="h-5 w-5 text-gray-400 absolute left-4 top-3.5 pointer-events-none" />
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-6 mt-8 border-t border-gray-200 dark:border-reply-border-dark">
              <Button type="button" variant="ghost" onClick={() => setSelectedSlot(null)}>
                Volver
              </Button>
              <Button type="submit" isLoading={submitting} className="px-8">
                Confirmar Reserva
              </Button>
            </div>
          </form>
        )}
      </Card>
    </div>
  );
};
