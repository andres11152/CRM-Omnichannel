import React from "react";
import { AlertTriangle, Info, CheckCircle2 } from "lucide-react";
import { Modal, ModalButton } from "./Modal";

interface ConfirmationModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: "danger" | "info" | "success";
  isLoading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Confirmación estandarizada. Usa el primitivo <Modal> para compartir EXACTAMENTE
 * el mismo backdrop/blur/animación/scroll-lock que el resto de modales.
 */
export const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  isOpen,
  title,
  message,
  confirmText = "Continuar",
  cancelText = "Cancelar",
  variant = "info",
  isLoading = false,
  onConfirm,
  onCancel,
}) => {
  const iconColors = {
    danger: "text-red-600 bg-red-50 dark:bg-red-900/20",
    info: "text-reply-brand bg-reply-bg dark:bg-reply-surface-dark",
    success: "text-green-600 bg-green-50 dark:bg-green-900/20",
  };
  const Icon = variant === "danger" ? AlertTriangle : variant === "success" ? CheckCircle2 : Info;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onCancel}
      size="sm"
      hideCloseButton
      busy={isLoading}
      closeOnBackdrop={!isLoading}
    >
      <div className="flex flex-col items-center text-center py-2">
        <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-6 ${iconColors[variant]}`}>
          <Icon className="w-8 h-8" />
        </div>

        <h3 className="text-xl font-black text-reply-text-primary dark:text-reply-text-primary-dark mb-3">
          {title}
        </h3>
        <p className="text-reply-text-secondary dark:text-reply-text-secondary-dark text-sm leading-relaxed mb-8">
          {message}
        </p>

        <div className="w-full space-y-3">
          <ModalButton
            variant={variant === "danger" ? "danger" : "primary"}
            loading={isLoading}
            onClick={onConfirm}
            className="w-full py-4 rounded-2xl font-black"
          >
            {confirmText}
          </ModalButton>
          <ModalButton
            variant="secondary"
            onClick={onCancel}
            disabled={isLoading}
            className="w-full py-4 rounded-2xl font-bold"
          >
            {cancelText}
          </ModalButton>
        </div>
      </div>
    </Modal>
  );
};
