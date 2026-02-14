import React, { useEffect } from "react";
import { createPortal } from "react-dom";

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
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const variantColors = {
    danger: "bg-red-600 hover:bg-red-700 shadow-red-500/30",
    info: "bg-reply-brand hover:bg-reply-brand-dark shadow-reply-brand/30",
    success: "bg-green-600 hover:bg-green-700 shadow-green-500/30",
  };

  const iconColors = {
    danger: "text-red-600 bg-red-50 dark:bg-red-900/20",
    info: "text-reply-brand bg-reply-bg dark:bg-reply-surface-dark",
    success: "text-green-600 bg-green-50 dark:bg-green-900/20",
  };

  return createPortal(
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
        onClick={!isLoading ? onCancel : undefined}
      />

      <div className="bg-reply-surface dark:bg-reply-panel-dark w-full max-w-sm rounded-[2rem] shadow-2xl border border-reply-border dark:border-reply-border-dark relative z-10 animate-scale-in overflow-hidden">
        <div className="p-8 flex flex-col items-center text-center">
          <div
            className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-6 ${iconColors[variant]}`}
          >
            {variant === "danger" && (
              <svg
                className="w-8 h-8"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            )}
            {variant === "info" && (
              <svg
                className="w-8 h-8"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            )}
            {variant === "success" && (
              <svg
                className="w-8 h-8"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            )}
          </div>

          <h3 className="text-xl font-black text-reply-text-primary dark:text-reply-text-primary-dark mb-3">
            {title}
          </h3>
          <p className="text-reply-text-secondary dark:text-reply-text-secondary-dark text-sm leading-relaxed mb-8">
            {message}
          </p>

          <div className="w-full space-y-3">
            <button
              onClick={onConfirm}
              disabled={isLoading}
              className={`w-full py-4 text-white font-black rounded-2xl shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50 ${variantColors[variant]}`}
            >
              {isLoading && (
                <svg
                  className="animate-spin h-5 w-5 text-white"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth={4}
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
              )}
              {confirmText}
            </button>

            <button
              onClick={onCancel}
              disabled={isLoading}
              className="w-full py-4 text-reply-text-secondary dark:text-reply-text-secondary-dark font-bold rounded-2xl hover:bg-reply-bg dark:hover:bg-reply-border-dark transition-colors"
            >
              {cancelText}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
};
