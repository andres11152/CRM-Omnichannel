import React, { useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";

/**
 * 🏢 MODAL — Primitivo enterprise ÚNICO para TODOS los módulos.
 *
 * Centraliza, para que NADA varíe entre módulos:
 *  - Backdrop con blur + fade (enter/exit con framer-motion)
 *  - Panel con spring scale-in / scale-out (microanimación)
 *  - Header (título, subtítulo, icono, botón cerrar), body scrollable y footer
 *  - Skeleton de carga consistente (loading)
 *  - Scroll-lock del body, Escape para cerrar, click-outside, focus inicial, a11y
 *
 * REGLA: ningún módulo debe re-implementar el markup de un modal. Usar SIEMPRE
 * este componente (y sus piezas) para mantener paridad 100%.
 */

export type ModalSize = "sm" | "md" | "lg" | "xl" | "full";

const SIZE_CLASSES: Record<ModalSize, string> = {
  sm: "max-w-sm",
  md: "max-w-lg",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
  full: "max-w-6xl",
};

// Misma curva/feel en todos lados (Apple-like spring suave).
const BACKDROP_TRANSITION = { duration: 0.2, ease: [0.16, 1, 0.3, 1] as const };
const PANEL_VARIANTS = {
  hidden: { opacity: 0, scale: 0.96, y: 12 },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { type: "spring" as const, stiffness: 300, damping: 30 },
  },
  exit: { opacity: 0, scale: 0.96, y: 12, transition: { duration: 0.15 } },
};

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: React.ReactNode;
  size?: ModalSize;
  /** Muestra el skeleton estándar en el body en vez del contenido. */
  loading?: boolean;
  /** Slot de acciones al pie (botones). Si no se pasa, no se renderiza footer. */
  footer?: React.ReactNode;
  /** Cerrar al hacer click en el backdrop. Default true. */
  closeOnBackdrop?: boolean;
  /** Cerrar con tecla Escape. Default true. */
  closeOnEscape?: boolean;
  /** Oculta el botón X de la esquina. */
  hideCloseButton?: boolean;
  /** Deshabilita cierre (durante operaciones críticas). */
  busy?: boolean;
  className?: string;
  children?: React.ReactNode;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  icon,
  size = "md",
  loading = false,
  footer,
  closeOnBackdrop = true,
  closeOnEscape = true,
  hideCloseButton = false,
  busy = false,
  className = "",
  children,
}) => {
  const panelRef = useRef<HTMLDivElement>(null);

  // Scroll-lock del body
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  // Escape para cerrar + foco inicial en el panel
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && closeOnEscape && !busy) onClose();
    };
    document.addEventListener("keydown", onKey);
    // foco inicial (a11y): primer elemento enfocable o el panel
    const t = setTimeout(() => {
      const focusable = panelRef.current?.querySelector<HTMLElement>(
        'input, textarea, select, button, [href], [tabindex]:not([tabindex="-1"])',
      );
      (focusable || panelRef.current)?.focus?.();
    }, 50);
    return () => {
      document.removeEventListener("keydown", onKey);
      clearTimeout(t);
    };
  }, [isOpen, closeOnEscape, busy, onClose]);

  const handleBackdrop = useCallback(() => {
    if (closeOnBackdrop && !busy) onClose();
  }, [closeOnBackdrop, busy, onClose]);

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
          {/* Backdrop con blur */}
          <motion.div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={BACKDROP_TRANSITION}
            onClick={handleBackdrop}
            aria-hidden="true"
          />

          {/* Panel */}
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            tabIndex={-1}
            variants={PANEL_VARIANTS}
            initial="hidden"
            animate="visible"
            exit="exit"
            className={`relative z-10 w-full ${SIZE_CLASSES[size]} max-h-[90vh] flex flex-col bg-reply-surface dark:bg-reply-panel-dark rounded-3xl shadow-2xl border border-reply-border dark:border-reply-border-dark overflow-hidden focus:outline-none ${className}`}
          >
            {(title || !hideCloseButton) && (
              <div className="flex items-start gap-4 px-6 py-5 border-b border-reply-border dark:border-reply-border-dark shrink-0">
                {icon && (
                  <div className="w-11 h-11 rounded-2xl flex items-center justify-center bg-reply-bg dark:bg-reply-surface-dark text-reply-brand shrink-0">
                    {icon}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  {title && (
                    <h3 className="text-xl font-bold text-reply-text-primary dark:text-reply-text-primary-dark truncate">
                      {title}
                    </h3>
                  )}
                  {subtitle && (
                    <p className="text-sm text-reply-text-secondary dark:text-reply-text-secondary-dark mt-0.5 truncate">
                      {subtitle}
                    </p>
                  )}
                </div>
                {!hideCloseButton && (
                  <button
                    type="button"
                    onClick={() => !busy && onClose()}
                    disabled={busy}
                    aria-label="Cerrar"
                    className="w-9 h-9 rounded-xl flex items-center justify-center text-reply-text-secondary dark:text-reply-text-secondary-dark hover:bg-reply-bg dark:hover:bg-reply-border-dark transition-colors active:scale-95 disabled:opacity-40 shrink-0"
                  >
                    <X className="w-5 h-5" />
                  </button>
                )}
              </div>
            )}

            {/* Body */}
            <div className="px-6 py-5 overflow-y-auto flex-1">
              {loading ? <ModalSkeleton /> : children}
            </div>

            {/* Footer */}
            {footer && !loading && (
              <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-reply-border dark:border-reply-border-dark shrink-0">
                {footer}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
};

/** Skeleton estándar para el body en estado de carga. */
export const ModalSkeleton: React.FC = () => (
  <div className="space-y-4 animate-pulse">
    <div className="h-4 w-1/3 bg-slate-200 dark:bg-slate-700/50 rounded-md" />
    <div className="h-11 w-full bg-slate-200 dark:bg-slate-700/50 rounded-xl" />
    <div className="h-4 w-1/4 bg-slate-200 dark:bg-slate-700/50 rounded-md" />
    <div className="h-11 w-full bg-slate-200 dark:bg-slate-700/50 rounded-xl" />
    <div className="h-24 w-full bg-slate-200 dark:bg-slate-700/50 rounded-xl" />
  </div>
);

/** Botón de footer estandarizado (variantes alineadas con el resto del sistema). */
export const ModalButton: React.FC<
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: "primary" | "secondary" | "danger";
    loading?: boolean;
  }
> = ({ variant = "secondary", loading = false, children, className = "", disabled, ...props }) => {
  const variants = {
    primary: "bg-reply-brand hover:bg-reply-brand-dark text-white shadow-lg shadow-reply-brand/30",
    danger: "bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-500/30",
    secondary:
      "text-reply-text-secondary dark:text-reply-text-secondary-dark hover:bg-reply-bg dark:hover:bg-reply-border-dark",
  };
  return (
    <button
      disabled={disabled || loading}
      className={`px-5 py-2.5 rounded-xl font-bold text-sm transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2 ${variants[variant]} ${className}`}
      {...props}
    >
      {loading && (
        <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={4} />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      )}
      {children}
    </button>
  );
};
