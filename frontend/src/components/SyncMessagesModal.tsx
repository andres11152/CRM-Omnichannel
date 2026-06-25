import React, { useState } from "react";
import { History, RefreshCw } from "lucide-react";
import { Modal, ModalButton } from "@/components/ui/Modal";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (date: string) => void;
}

export const SyncMessagesModal: React.FC<Props> = ({
  isOpen,
  onClose,
  onSubmit,
}) => {
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!date) return;
    onSubmit(date);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Sincronizar Historial"
      icon={<History className="w-5 h-5" />}
      size="md"
      footer={
        <>
          <ModalButton variant="secondary" onClick={onClose}>
            Cancelar
          </ModalButton>
          <ModalButton variant="primary" type="submit" form="sync-messages-form">
            <RefreshCw className="w-4 h-4" />
            Iniciar Sincronización
          </ModalButton>
        </>
      }
    >
      <form id="sync-messages-form" onSubmit={handleSubmit} className="space-y-4">
        <div className="bg-reply-brand/5 dark:bg-reply-brand/10 p-4 rounded-lg text-sm text-reply-brand dark:text-reply-brand">
          <p>
            Esta herramienta buscará mensajes antiguos en tus chats de WhatsApp
            activos y los importará al CRM.
          </p>
          <p className="mt-2 font-medium">
            Nota: Solo se importarán los últimos 50 mensajes de cada chat que sean
            posteriores a la fecha seleccionada.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Fecha de Inicio
          </label>
          <input
            type="date"
            value={date}
            max={new Date().toISOString().split("T")[0]}
            onChange={(e) => setDate(e.target.value)}
            className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-reply-surface-dark text-gray-900 dark:text-white focus:ring-2 focus:ring-reply-brand focus:border-transparent outline-none transition-all"
            required
          />
          <p className="text-xs text-gray-500 mt-1">
            Se importarán mensajes desde esta fecha en adelante.
          </p>
        </div>
      </form>
    </Modal>
  );
};
