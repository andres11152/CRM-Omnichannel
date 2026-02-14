import { X, Download, Share } from "lucide-react";
import { usePWAInstall } from "@/hooks/usePWAInstall";

export const PWAInstallPrompt = () => {
  const {
    isInstallable,
    platform,
    showIOSInstructions,
    installApp,
    dismissIOSInstructions,
  } = usePWAInstall();

  // Android/Desktop: Native install button
  if (isInstallable && platform !== "ios") {
    return (
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-md animate-slide-up">
        <div className="bg-gradient-to-r from-teal-500 to-emerald-500 rounded-2xl shadow-2xl p-4 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <div className="flex-shrink-0 w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
              <Download className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-white font-bold text-sm">
                Instalar Aplicación
              </h3>
              <p className="text-white/90 text-xs">
                Acceso rápido desde tu pantalla de inicio
              </p>
            </div>
            <button
              onClick={installApp}
              className="flex-shrink-0 px-4 py-2 bg-white text-teal-600 rounded-xl font-bold text-sm hover:bg-reply-bg transition-colors shadow-lg"
            >
              Instalar
            </button>
          </div>
        </div>
      </div>
    );
  }

  // iOS: Educational banner
  if (showIOSInstructions) {
    return (
      <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
        <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl max-w-sm w-full overflow-hidden animate-slide-up">
          {/* Header */}
          <div className="bg-gradient-to-r from-teal-500 to-emerald-500 p-6 relative">
            <button
              onClick={dismissIOSInstructions}
              className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-white/20 hover:bg-white/30 transition-colors"
            >
              <X className="w-5 h-5 text-white" />
            </button>
            <div className="flex flex-col items-center text-center">
              <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center mb-3">
                <Download className="w-8 h-8 text-white" />
              </div>
              <h2 className="text-white font-bold text-xl">Instalar OmniCRM</h2>
              <p className="text-white/90 text-sm mt-1">
                Acceso rápido desde tu iPhone
              </p>
            </div>
          </div>

          {/* Instructions */}
          <div className="p-6 space-y-4">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-10 h-10 bg-teal-50 dark:bg-teal-900/20 rounded-xl flex items-center justify-center">
                <span className="text-teal-600 dark:text-teal-400 font-bold text-lg">
                  1
                </span>
              </div>
              <div className="flex-1 pt-1">
                <p className="text-gray-900 dark:text-white font-semibold text-sm">
                  Toca el botón Compartir
                </p>
                <div className="mt-2 flex items-center gap-2 text-gray-600 dark:text-gray-400 text-xs">
                  <Share className="w-4 h-4" />
                  <span>En la barra inferior de Safari</span>
                </div>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-10 h-10 bg-teal-50 dark:bg-teal-900/20 rounded-xl flex items-center justify-center">
                <span className="text-teal-600 dark:text-teal-400 font-bold text-lg">
                  2
                </span>
              </div>
              <div className="flex-1 pt-1">
                <p className="text-gray-900 dark:text-white font-semibold text-sm">
                  Selecciona "Agregar a pantalla de inicio"
                </p>
                <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 bg-gray-100 dark:bg-gray-700 rounded-lg text-xs text-gray-700 dark:text-gray-300">
                  <svg
                    className="w-3.5 h-3.5"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" />
                  </svg>
                  <span>Agregar a pantalla de inicio</span>
                </div>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-10 h-10 bg-teal-50 dark:bg-teal-900/20 rounded-xl flex items-center justify-center">
                <span className="text-teal-600 dark:text-teal-400 font-bold text-lg">
                  3
                </span>
              </div>
              <div className="flex-1 pt-1">
                <p className="text-gray-900 dark:text-white font-semibold text-sm">
                  Confirma para instalar
                </p>
                <p className="mt-1 text-gray-600 dark:text-gray-400 text-xs">
                  La app aparecerá en tu pantalla de inicio
                </p>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="p-6 pt-0">
            <button
              onClick={dismissIOSInstructions}
              className="w-full py-3 bg-gradient-to-r from-teal-500 to-emerald-500 text-white rounded-xl font-bold hover:opacity-90 transition-opacity shadow-lg"
            >
              Entendido
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
};

