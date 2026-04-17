import React from "react";
import type { SettingsTabProps } from "./SettingsShared";

interface SecurityTabProps {
  passwords: { current: string; new: string; confirm: string };
  setPasswords: React.Dispatch<React.SetStateAction<{ current: string; new: string; confirm: string }>>;
  loading: boolean;
  handleSave: () => void;
}

export const SecurityTab: React.FC<SecurityTabProps> = ({
  passwords,
  setPasswords,
  loading,
  handleSave,
}) => (
  <div className="bg-white dark:bg-reply-panel-dark p-6 md:p-10 rounded-2xl border border-gray-200 dark:border-reply-border-dark shadow-sm animate-fadeIn max-w-2xl mx-auto">
    <div className="flex flex-col items-center text-center mb-8">
      <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 text-red-600 rounded-2xl flex items-center justify-center mb-4">
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
      </div>
      <h3 className="text-xl font-bold text-gray-800 dark:text-white">Seguridad de la Cuenta</h3>
      <p className="text-sm text-gray-500 mt-2 leading-relaxed">
        Protege el acceso a tu plataforma. Te recomendamos usar contraseñas fuertes y únicas.
      </p>
    </div>

    <div className="space-y-4 max-w-md mx-auto">
      <div>
        <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Contraseña Actual</label>
        <input
          type="password"
          placeholder="Contraseña Actual"
          className="w-full border border-gray-200 dark:border-reply-border-dark bg-reply-bg dark:bg-black/20 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-red-500/20 focus:border-red-500 outline-none transition-all"
          value={passwords.current}
          onChange={(e) => setPasswords({ ...passwords, current: e.target.value })}
        />
      </div>
      <div>
        <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Nueva Contraseña</label>
        <input
          type="password"
          placeholder="Mínimo 8 caracteres"
          className="w-full border border-gray-200 dark:border-reply-border-dark bg-reply-bg dark:bg-black/20 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-red-500/20 focus:border-red-500 outline-none transition-all"
          value={passwords.new}
          onChange={(e) => setPasswords({ ...passwords, new: e.target.value })}
        />
      </div>
      <div>
        <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Confirmar Nueva Contraseña</label>
        <input
          type="password"
          placeholder="Repite la contraseña"
          className="w-full border border-gray-200 dark:border-reply-border-dark bg-reply-bg dark:bg-black/20 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-red-500/20 focus:border-red-500 outline-none transition-all"
          value={passwords.confirm}
          onChange={(e) => setPasswords({ ...passwords, confirm: e.target.value })}
        />
      </div>

      <div className="pt-4">
        <button
          disabled={loading || !passwords.new}
          className={`w-full py-3 rounded-xl font-bold text-sm shadow-lg transition-all flex items-center justify-center gap-2 ${loading || !passwords.new ? "bg-gray-100 text-gray-400 cursor-not-allowed" : "bg-red-600 text-white hover:bg-red-700 active:scale-95 shadow-red-500/30"}`}
          onClick={handleSave}
        >
          {loading ? (
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
          ) : (
            "Actualizar Contraseña"
          )}
        </button>
      </div>

      <div className="p-4 bg-reply-bg dark:bg-gray-800/50 rounded-xl border border-gray-100 dark:border-reply-border-dark mt-6">
        <h4 className="text-[10px] font-bold text-gray-400 uppercase mb-2">Tip de Seguridad</h4>
        <p className="text-[11px] text-gray-500 leading-tight italic">
          "Usa una combinación de letras, números y caracteres especiales. No compartas nunca tu contraseña con terceros."
        </p>
      </div>
    </div>
  </div>
);
