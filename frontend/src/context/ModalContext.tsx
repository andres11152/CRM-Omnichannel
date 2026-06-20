import React, { createContext, useContext, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";

// ─── Types ──────────────────────────────────────────────────────────────────

type ModalVariant = "danger" | "warning" | "info" | "success";

interface ConfirmOptions {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: ModalVariant;
}

interface AlertOptions {
  title: string;
  message: string;
  confirmText?: string;
  variant?: ModalVariant;
}

interface ModalEntry {
  id: number;
  type: "confirm" | "alert";
  options: ConfirmOptions | AlertOptions;
  resolve: (value: boolean) => void;
}

interface ModalContextValue {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  alert: (options: AlertOptions) => Promise<void>;
}

// ─── Context ─────────────────────────────────────────────────────────────────

const ModalContext = createContext<ModalContextValue | null>(null);

// ─── Variant styles ──────────────────────────────────────────────────────────

const VARIANT_BTN: Record<ModalVariant, string> = {
  danger:  "bg-red-600 hover:bg-red-700 shadow-red-500/25",
  warning: "bg-amber-500 hover:bg-amber-600 shadow-amber-500/25",
  info:    "bg-reply-brand hover:bg-reply-brand-dark shadow-reply-brand/25",
  success: "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-500/25",
};

const VARIANT_ICON_BG: Record<ModalVariant, string> = {
  danger:  "bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400",
  warning: "bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400",
  info:    "bg-sky-50 dark:bg-sky-900/20 text-sky-600 dark:text-sky-400",
  success: "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400",
};

const VARIANT_RING: Record<ModalVariant, string> = {
  danger:  "ring-red-200 dark:ring-red-800/40",
  warning: "ring-amber-200 dark:ring-amber-800/40",
  info:    "ring-sky-200 dark:ring-sky-800/40",
  success: "ring-emerald-200 dark:ring-emerald-800/40",
};

function VariantIcon({ variant }: { variant: ModalVariant }) {
  const cls = "w-7 h-7";
  if (variant === "danger")
    return (
      <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
    );
  if (variant === "warning")
    return (
      <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
      </svg>
    );
  if (variant === "success")
    return (
      <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
      </svg>
    );
  return (
    <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

// ─── Single modal renderer ────────────────────────────────────────────────────

function EnterpriseModal({ entry, onClose }: { entry: ModalEntry; onClose: (v: boolean) => void }) {
  const { type, options } = entry;
  const variant = (options.variant ?? "info") as ModalVariant;
  const confirmText = (options as ConfirmOptions).confirmText ?? "Continuar";
  const cancelText = (options as ConfirmOptions).cancelText ?? "Cancelar";

  return createPortal(
    <div className="fixed inset-0 z-[99999] flex items-end sm:items-center justify-center p-4 sm:p-6">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={() => type === "alert" ? onClose(true) : onClose(false)}
      />

      {/* Card */}
      <div
        className={`
          relative z-10 w-full max-w-md
          bg-white dark:bg-reply-panel-dark
          rounded-3xl shadow-2xl
          ring-1 ${VARIANT_RING[variant]}
          overflow-hidden
          animate-[modal-in_0.2s_cubic-bezier(0.34,1.56,0.64,1)]
        `}
      >
        {/* Top accent bar */}
        <div className={`h-1 w-full ${VARIANT_BTN[variant].split(" ")[0]}`} />

        <div className="px-7 pb-7 pt-6 flex flex-col gap-5">
          {/* Header row */}
          <div className="flex items-start gap-4">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 ring-1 ${VARIANT_ICON_BG[variant]}`}>
              <VariantIcon variant={variant} />
            </div>
            <div className="flex-1 min-w-0 pt-0.5">
              <h3 className="text-base font-black text-reply-text-primary dark:text-reply-text-primary-dark leading-snug">
                {options.title}
              </h3>
              <p className="mt-1.5 text-sm text-reply-text-secondary dark:text-reply-text-secondary-dark leading-relaxed">
                {options.message}
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className={`flex gap-3 ${type === "confirm" ? "flex-row-reverse" : ""}`}>
            <button
              autoFocus
              onClick={() => onClose(true)}
              className={`
                flex-1 py-3 px-5 text-sm font-black text-white rounded-2xl
                shadow-lg transition-all active:scale-95 duration-150
                ${VARIANT_BTN[variant]}
              `}
            >
              {confirmText}
            </button>
            {type === "confirm" && (
              <button
                onClick={() => onClose(false)}
                className="flex-1 py-3 px-5 text-sm font-bold rounded-2xl
                  text-reply-text-secondary dark:text-reply-text-secondary-dark
                  bg-reply-bg dark:bg-reply-border-dark
                  hover:bg-reply-border dark:hover:bg-reply-border-dark/80
                  transition-colors duration-150"
              >
                {cancelText}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export const ModalProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [modals, setModals] = useState<ModalEntry[]>([]);
  const counter = useRef(0);

  const push = useCallback(<T extends "confirm" | "alert">(type: T, options: T extends "confirm" ? ConfirmOptions : AlertOptions): Promise<boolean> => {
    return new Promise<boolean>((resolve) => {
      const id = ++counter.current;
      setModals((prev) => [...prev, { id, type, options, resolve }]);
    });
  }, []);

  const confirm = useCallback(
    (options: ConfirmOptions) => push("confirm", options),
    [push],
  );

  const alert = useCallback(
    async (options: AlertOptions) => { await push("alert", options); },
    [push],
  );

  const close = useCallback((id: number, value: boolean) => {
    setModals((prev) => {
      const entry = prev.find((m) => m.id === id);
      entry?.resolve(value);
      return prev.filter((m) => m.id !== id);
    });
  }, []);

  return (
    <ModalContext.Provider value={{ confirm, alert }}>
      {children}
      {modals.map((entry) => (
        <EnterpriseModal key={entry.id} entry={entry} onClose={(v) => close(entry.id, v)} />
      ))}
    </ModalContext.Provider>
  );
};

// ─── Hook ─────────────────────────────────────────────────────────────────────

export const useModal = (): ModalContextValue => {
  const ctx = useContext(ModalContext);
  if (!ctx) throw new Error("useModal must be used inside <ModalProvider>");
  return ctx;
};
