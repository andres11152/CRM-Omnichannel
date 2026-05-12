import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { 
  ShieldAlert, 
  X, 
  User as UserIcon, 
  ChevronRight, 
  Loader2,
  ShieldCheck,
  Headset
} from "lucide-react";

interface UserInfo {
  id: string;
  email: string;
  name: string;
  role: string;
  profilePicUrl?: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (userId?: string) => void;
  companyName: string;
  users: UserInfo[];
  loadingUsers: boolean;
}

export const ImpersonationModal: React.FC<Props> = ({
  isOpen,
  onClose,
  onConfirm,
  companyName,
  users,
  loadingUsers,
}) => {
  const { t } = useTranslation();
  const [selectedUserId, setSelectedUserId] = useState<string | "">("");

  if (!isOpen) return null;

  const handleConfirm = () => {
    onConfirm(selectedUserId || undefined);
  };

  const getRoleIcon = (role: string) => {
    if (role === "ADMIN") return <ShieldCheck className="w-3.5 h-3.5 text-blue-500" />;
    return <Headset className="w-3.5 h-3.5 text-emerald-500" />;
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white dark:bg-reply-panel-dark rounded-2xl shadow-2xl border border-slate-200 dark:border-reply-border-dark w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 dark:border-reply-border-dark flex items-center justify-between bg-slate-50/50 dark:bg-white/5">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-lg">
              <ShieldAlert className="w-5 h-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                {t("tenants.impersonation.title", "Protocolo de Soporte")}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {t("tenants.impersonation.impersonating", "Impersonando:")} <span className="font-semibold text-amber-600 dark:text-amber-400">{companyName}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 dark:hover:bg-white/10 rounded-full transition-colors"
          >
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-100 dark:border-blue-800/30">
            <p className="text-sm text-blue-800 dark:text-blue-200 leading-relaxed">
              {t("tenants.impersonation.description", "Seleccione el perfil de usuario con el que desea acceder para realizar las labores de soporte técnico.")}
            </p>
          </div>

          <div className="space-y-3 max-h-[300px] overflow-y-auto custom-scrollbar pr-1">
            {loadingUsers ? (
              <div className="flex flex-col items-center justify-center py-8 text-slate-400">
                <Loader2 className="w-8 h-8 animate-spin mb-2" />
                <p className="text-sm">{t("tenants.impersonation.loading", "Cargando usuarios...")}</p>
              </div>
            ) : users.length === 0 ? (
              <div className="text-center py-8 text-slate-400">
                <p className="text-sm">{t("tenants.impersonation.no_users", "No se encontraron usuarios disponibles.")}</p>
              </div>
            ) : (
              users.map((u) => (
                <button
                  key={u.id}
                  onClick={() => setSelectedUserId(u.id)}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all duration-200 text-left group ${
                    selectedUserId === u.id
                      ? "bg-blue-50 dark:bg-blue-900/30 border-blue-500 shadow-sm"
                      : "bg-slate-50 dark:bg-white/5 border-slate-100 dark:border-transparent hover:border-slate-300 dark:hover:border-white/20"
                  }`}
                >
                  <div className="relative">
                    {u.profilePicUrl ? (
                      <img src={u.profilePicUrl} alt={u.name} className="w-10 h-10 rounded-full object-cover border-2 border-white dark:border-slate-800 shadow-sm" />
                    ) : (
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shadow-sm ${
                        selectedUserId === u.id ? "bg-blue-500 text-white" : "bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400"
                      }`}>
                        {u.name.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="absolute -bottom-1 -right-1 bg-white dark:bg-slate-800 rounded-full p-0.5 shadow-sm">
                      {getRoleIcon(u.role)}
                    </div>
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className={`font-semibold truncate ${selectedUserId === u.id ? "text-blue-700 dark:text-blue-300" : "text-slate-900 dark:text-white"}`}>
                        {u.name}
                      </p>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider ${
                        u.role === "ADMIN" ? "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300" : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300"
                      }`}>
                        {u.role}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                      {u.email}
                    </p>
                  </div>

                  <ChevronRight className={`w-4 h-4 transition-transform ${selectedUserId === u.id ? "text-blue-500 translate-x-0.5" : "text-slate-300 dark:text-slate-600"}`} />
                </button>
              ))
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 dark:bg-white/5 border-t border-slate-100 dark:border-reply-border-dark flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-white/10 rounded-xl transition-colors"
          >
            {t("common.cancel", "Cancelar")}
          </button>
          <button
            onClick={handleConfirm}
            disabled={!selectedUserId}
            className={`flex-1 px-4 py-2.5 text-sm font-bold text-white rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 ${
              selectedUserId
                ? "bg-blue-600 hover:bg-blue-700 shadow-blue-500/20"
                : "bg-slate-400 cursor-not-allowed opacity-50"
            }`}
          >
            {t("tenants.impersonation.login_button", "Iniciar Sesión")}
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
