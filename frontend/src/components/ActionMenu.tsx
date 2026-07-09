import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';

interface ActionMenuProps {
  onSchedule: () => void;
  onProduct: () => void;
  onRequestData: () => void;
  onPayment: () => void;
  disabled?: boolean;
}

export const ActionMenu: React.FC<ActionMenuProps> = ({
  onSchedule,
  onProduct,
  onRequestData,
  onPayment,
  disabled = false
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null); // Ref for Portal Content

  useEffect(() => {
    const updatePosition = () => {
      if (buttonRef.current && isOpen) {
        const rect = buttonRef.current.getBoundingClientRect();
        setPosition({
            top: rect.top - 230,
            left: rect.left
        });
      }
    };

    updatePosition();
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);
    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [isOpen]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      // 1. Check Button
      if (buttonRef.current && buttonRef.current.contains(event.target as Node)) {
          return;
      }
      // 2. Check Menu Portal logic
      if (menuRef.current && menuRef.current.contains(event.target as Node)) {
          return;
      }

      setIsOpen(false);
    };

    if (isOpen) {
        document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
        document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleAction = (e: React.MouseEvent, action: () => void) => {
    e.stopPropagation(); // Stop bubbling to prevent closing
    action();
    setIsOpen(false);
  };

  return (
    <>
      <button
        ref={buttonRef}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={`
          flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition-all duration-200 z-10
          ${isOpen 
            ? 'bg-purple-600 text-white rotate-45 shadow-lg shadow-purple-500/30' 
            : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-purple-100 dark:hover:bg-purple-900/30 hover:text-purple-600 dark:hover:text-purple-400'
          }
          disabled:opacity-50 disabled:cursor-not-allowed
        `}
        title="Acciónes Rpidas"
      >
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
        </svg>
      </button>

      {isOpen && createPortal(
        <div 
            ref={menuRef}
            className="fixed w-64 bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-100 dark:border-reply-border-dark overflow-hidden duration-200"
            style={{ 
                top: Math.max(10, position.top),
                left: position.left,
                zIndex: 99999
            }}
            onMouseDown={(e) => e.stopPropagation()} // Prevent outside click logic for drags inside
        >
          <div className="p-2 space-y-1">
            
            <button
              onClick={(e) => handleAction(e, onSchedule)}
              className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-reply-bg dark:hover:bg-gray-700/50 rounded-lg transition-colors group text-left"
            >
              <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                <svg className="w-4 h-4 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">Programar Envío</div>
                <div className="text-[10px] text-gray-500 dark:text-gray-400 line-clamp-1">Enviar mensaje ms tarde</div>
              </div>
            </button>

            <button
              onClick={(e) => handleAction(e, onProduct)}
              className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-reply-bg dark:hover:bg-gray-700/50 rounded-lg transition-colors group text-left"
            >
              <div className="w-8 h-8 rounded-lg bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                <svg className="w-4 h-4 text-amber-600 dark:text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                </svg>
              </div>
              <div>
                <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">Enviar Producto</div>
                <div className="text-[10px] text-gray-500 dark:text-gray-400 line-clamp-1">Catlogo o Item singular</div>
              </div>
            </button>

            <button
              onClick={(e) => handleAction(e, onRequestData)}
              className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-reply-bg dark:hover:bg-gray-700/50 rounded-lg transition-colors group text-left"
            >
              <div className="w-8 h-8 rounded-lg bg-teal-50 dark:bg-teal-900/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                <svg className="w-4 h-4 text-teal-600 dark:text-teal-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                </svg>
              </div>
              <div>
                <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">Solicitar Datos</div>
                <div className="text-[10px] text-gray-500 dark:text-gray-400 line-clamp-1">Formulario rpido</div>
              </div>
            </button>

            <button
              onClick={(e) => handleAction(e, onPayment)}
              className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-reply-bg dark:hover:bg-gray-700/50 rounded-lg transition-colors group text-left"
            >
              <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                <svg className="w-4 h-4 text-emerald-600 dark:text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                </svg>
              </div>
              <div>
                <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">Link de Pago</div>
                <div className="text-[10px] text-gray-500 dark:text-gray-400 line-clamp-1">Generar cobro MercadoPago/Nequi</div>
              </div>
            </button>

          </div>
        </div>,
        document.body
      )}
    </>
  );
};


