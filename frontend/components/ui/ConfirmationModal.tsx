import React from "react";
import { createPortal } from "react-dom";

interface Props {
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmText?: string;
  cancelText?: string;
  isLoading?: boolean;
  variant?: "danger" | "warning" | "info";
}

export const ConfirmationModal: React.FC<Props> = ({
  isOpen,
  title,
  message,
  onConfirm,
  onCancel,
  confirmText = "Confirmar",
  cancelText = "Cancelar",
  isLoading = false,
  variant = "danger",
}) => {
  if (!isOpen) return null;

  const getButtonColor = () => {
    switch (variant) {
      case "danger":
        return "bg-red-600 hover:bg-red-700 focus:ring-red-500";
      case "warning":
        return "bg-yellow-600 hover:bg-yellow-700 focus:ring-yellow-500";
      case "info":
        return "bg-blue-600 hover:bg-blue-700 focus:ring-blue-500";
      default:
        return "bg-red-600 hover:bg-red-700";
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
        onClick={!isLoading ? onCancel : undefined}
      />

      {/* Modal */}
      <div className="relative bg-white dark:bg-[#1f2c33] rounded-xl shadow-2xl w-full max-w-sm p-6 transform transition-all scale-100 opacity-100 border border-gray-200 dark:border-gray-700">
        <div className="flex flex-col items-center text-center">
          {/* Icon based on variant */}
          {variant === "danger" && (
            <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mb-4 text-red-600 dark:text-red-400">
              <svg
                className="w-6 h-6"
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
            </div>
          )}

          <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-2">
            {title}
          </h3>

          <p className="text-sm text-gray-500 dark:text-gray-400 mb-6 leading-relaxed">
            {message}
          </p>
        </div>

        <div className="flex gap-3 mt-2">
          <button
            onClick={onCancel}
            disabled={isLoading}
            className="flex-1 px-4 py-2.5 text-sm font-semibold text-gray-700 dark:text-gray-300 bg-white dark:bg-[#111b21] border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg transition-colors focus:ring-2 focus:ring-gray-200 outline-none"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            disabled={isLoading}
            className={`flex-1 px-4 py-2.5 text-sm font-semibold text-white rounded-lg shadow-md transition-all focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-gray-900 outline-none flex items-center justify-center gap-2 ${getButtonColor()}`}
          >
            {isLoading && (
              <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></span>
            )}
            {confirmText}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};
