import React, { useState } from "react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { Info, Send, Calendar, Clock } from "lucide-react";
import { Modal } from "@/components/ui/Modal";

export interface ScheduleModalProps {
  onClose: () => void;
  onConfirm: (date: Date, message: string) => void;
}

export const ScheduleModal: React.FC<ScheduleModalProps> = ({ onClose, onConfirm }) => {
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [message, setMessage] = useState("");
  const { t } = useTranslation();

  const handleConfirm = () => {
    if (!date || !time) return toast.error(t("actions.err_date_time", "Selecciona fecha y hora"));
    if (!message.trim()) return toast.error(t("actions.err_msg", "Escribe el mensaje a programar"));

    const scheduledDate = new Date(`${date}T${time}`);
    if (scheduledDate < new Date())
      return toast.error(t("actions.err_future", "La fecha debe ser futura"));

    onConfirm(scheduledDate, message);
  };

  return (
    <Modal isOpen onClose={onClose} title={t("actions.schedule_title", "Programación Enterprise")} size="md">
      <div className="space-y-5">
        <div className="p-4 bg-indigo-50 dark:bg-indigo-900/20 rounded-2xl flex items-start gap-3 border border-indigo-100 dark:border-indigo-500/20">
          <Info className="w-5 h-5 text-indigo-600 dark:text-indigo-400 mt-0.5" />
          <p className="text-[12px] text-indigo-800 dark:text-indigo-200 font-medium">
            {t("actions.schedule_desc", "El sistema procesará y enviará este mensaje automáticamente a través de la API oficial de WhatsApp en el momento exacto programado.")}
          </p>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs font-bold text-gray-500 uppercase ml-1">
            <Send className="w-3.5 h-3.5" />
            {t("actions.message_content", "Contenido del Mensaje")}
          </div>
          <textarea
            className="w-full p-4 bg-gray-50 dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-white/5 focus:ring-2 focus:ring-indigo-500 outline-none resize-none h-32 text-sm transition-all shadow-inner"
            placeholder={t("actions.message_placeholder", "Escribe aquí el mensaje que deseas programar...")}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            autoFocus
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-bold text-gray-500 uppercase ml-1">
              <Calendar className="w-3.5 h-3.5" />
              {t("actions.send_date", "Fecha de Envío")}
            </div>
            <input
              type="date"
              className="w-full p-3 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-white/5 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-bold text-gray-500 uppercase ml-1">
              <Clock className="w-3.5 h-3.5" />
              {t("actions.local_time", "Hora Local")}
            </div>
            <input
              type="time"
              className="w-full p-3 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-white/5 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
              onChange={(e) => setTime(e.target.value)}
            />
          </div>
        </div>

        <button
          onClick={handleConfirm}
          className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-black transition-all shadow-lg shadow-indigo-500/30 mt-2 flex items-center justify-center gap-2 group active:scale-[0.98]"
        >
          <Calendar className="w-5 h-5 group-hover:rotate-12 transition-transform" />
          {t("actions.schedule_btn", "PROGRAMAR ENVÍO OFICIAL")}
        </button>
      </div>
    </Modal>
  );
};
