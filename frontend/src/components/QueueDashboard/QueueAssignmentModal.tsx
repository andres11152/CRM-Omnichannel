import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Agent, QueueConfig } from "@/types";
import { Modal, ModalButton } from "../ui/Modal";
import { Users } from "lucide-react";

export const QueueAssignmentModal = ({
  isOpen,
  onClose,
  agent,
  onSave,
  availableQueues,
}: {
  isOpen: boolean;
  onClose: () => void;
  agent: Agent | null;
  onSave: (queues: string[]) => void;
  availableQueues: QueueConfig[];
}) => {
  const { t } = useTranslation();
  const [selectedQueues, setSelectedQueues] = useState<string[]>([]);

  useEffect(() => {
    if (agent) {
      // Use agent.queues if available, otherwise fallback to department parsing or empty
      const current = agent.queues?.map((q) => q.id) || [];
      setSelectedQueues(current);
    }
  }, [agent]);

  if (!isOpen || !agent) return null;

  const toggleQueue = (queueId: string) => {
    setSelectedQueues((prev) =>
      prev.includes(queueId)
        ? prev.filter((q) => q !== queueId)
        : [...prev, queueId],
    );
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={t("queue_dashboard.assignment_modal.title", "Configurar Colas para {{name}}", { name: agent.name })}
      icon={<Users className="w-5 h-5" />}
      size="sm"
      footer={
        <>
          <ModalButton variant="secondary" onClick={onClose}>
            {t("queue_dashboard.assignment_modal.cancel", "Cancelar")}
          </ModalButton>
          <ModalButton variant="primary" onClick={() => onSave(selectedQueues)}>
            {t("queue_dashboard.assignment_modal.save_changes", "Guardar Cambios")}
          </ModalButton>
        </>
      }
    >
      <div className="space-y-3">
        {availableQueues.length === 0 ? (
          <p className="text-gray-500 text-sm">{t("queue_dashboard.assignment_modal.no_queues_available", "No hay colas disponibles.")}</p>
        ) : (
          availableQueues.map((queue) => (
            <label
              key={queue.id}
              className="flex items-center gap-3 cursor-pointer p-2 hover:bg-reply-bg dark:hover:bg-gray-800 rounded"
            >
              <input
                type="checkbox"
                checked={selectedQueues.includes(queue.id)}
                onChange={() => toggleQueue(queue.id)}
                className="w-5 h-5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span className="text-gray-700 dark:text-gray-300">
                {queue.name}
              </span>
            </label>
          ))
        )}
      </div>
    </Modal>
  );
};
