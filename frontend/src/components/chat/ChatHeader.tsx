import React from "react";
import { Contact, AIConfig, SenderType } from "@/types";
import { 
  ChevronLeft, 
  ExternalLink, 
  Ban, 
  CheckCircle2, 
  Phone, 
  UserPlus, 
  RefreshCcw, 
  Users,
  FileText
} from "lucide-react";
import { ChatHeaderEnhanced } from "../ChatHeaderEnhanced";

interface ChatHeaderProps {
  displayContact: Contact;
  socketStatus: "connected" | "disconnected";
  isSyncing: boolean;
  onBack?: () => void;
  onSync: () => void;
  onResolve: () => void;
  onTransfer: () => void;
  onEditContact: () => void;
  toggleCustomer360: () => void;
  showParticipants: () => void;
  isCustomer360Visible: boolean;
}

export const ChatHeader: React.FC<ChatHeaderProps> = ({
  displayContact,
  socketStatus,
  isSyncing,
  onBack,
  onSync,
  onResolve,
  onTransfer,
  onEditContact,
  toggleCustomer360,
  showParticipants,
  isCustomer360Visible,
}) => {
  return (
    <div className="flex flex-col border-b border-gray-200 dark:border-white/5 bg-white/80 dark:bg-[#0b141a]/80 backdrop-blur-md z-10 relative">
      <div className="px-4 py-2.5 flex items-center justify-between min-h-[64px]">
        {/* Left: Back & Contact Info */}
        <div className="flex items-center gap-3 overflow-hidden">
          {onBack && (
            <button
              onClick={onBack}
              className="p-2 -ml-2 hover:bg-gray-100 dark:hover:bg-white/5 rounded-full text-gray-500 lg:hidden"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
          )}

          <div className="flex items-center gap-3 min-w-0">
            <div className="relative flex-shrink-0">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-lg shadow-sm">
                {(displayContact.isGroup && displayContact.name
                  ? displayContact.name.replace(/^\[GROUP\]\s*/i, "")?.[0]
                  : displayContact.name?.[0])?.toUpperCase() || "?"}
              </div>
              <div
                className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white dark:border-[#0b141a] shadow-sm ${
                  socketStatus === "connected" ? "bg-emerald-500" : "bg-gray-400"
                }`}
              />
            </div>

            <div className="flex flex-col min-w-0">
              <h1 className="text-[15px] font-bold text-gray-900 dark:text-gray-100 truncate flex items-center gap-2 max-w-full">
                <span className="truncate">
                  {displayContact.isGroup && displayContact.name
                    ? displayContact.name.replace(/^\[GROUP\]\s*/i, "")
                    : displayContact.name || displayContact.phone}
                </span>
                {displayContact.isGroup && (
                  <Users className="w-4 h-4 flex-shrink-0 text-indigo-500" />
                )}
              </h1>
              <div className="flex items-center gap-2">
                <span className="text-[12px] text-gray-500 dark:text-gray-400 truncate font-medium">
                  {displayContact.isGroup
                    ? "Grupo de WhatsApp"
                    : displayContact.phone || "Sin número"}
                </span>
                {socketStatus === "disconnected" && (
                  <span className="text-[10px] bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400 px-1.5 py-0.5 rounded font-bold animate-pulse uppercase tracking-wider">
                    Desconectado
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-1 sm:gap-2">
          {displayContact.isGroup && (
            <button
              onClick={showParticipants}
              className="p-2 hover:bg-gray-100 dark:hover:bg-white/5 rounded-lg text-gray-500 transition-all active:scale-95"
              title="Participantes del grupo"
            >
              <Users className="w-5 h-5" />
            </button>
          )}

          <button
            onClick={onSync}
            disabled={isSyncing}
            className={`p-2 hover:bg-gray-100 dark:hover:bg-white/5 rounded-lg text-gray-500 transition-all active:scale-95 ${
              isSyncing ? "animate-spin text-indigo-500" : ""
            }`}
            title="Sincronizar historial completo"
          >
            <RefreshCcw className="w-5 h-5" />
          </button>

          <button
            onClick={onTransfer}
            className="p-2 hover:bg-gray-100 dark:hover:bg-white/5 rounded-lg text-gray-500 transition-all active:scale-95"
            title="Transferir ticket"
          >
            <ExternalLink className="w-5 h-5" />
          </button>

          {!displayContact.realContactId && !displayContact.isGroup && (
            <button
              onClick={onEditContact}
              className="p-2 hover:bg-gray-100 dark:hover:bg-white/5 rounded-lg text-emerald-500 transition-all active:scale-95"
              title="Guardar como contacto"
            >
              <UserPlus className="w-5 h-5" />
            </button>
          )}

          <button
            onClick={onResolve}
            className="flex items-center gap-2 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-xs font-bold shadow-sm transition-all active:scale-95"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span className="hidden sm:inline">Resolver</span>
          </button>

          <button
            onClick={toggleCustomer360}
            className={`p-2 rounded-lg transition-all active:scale-95 ${
              isCustomer360Visible
                ? "bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400"
                : "text-gray-500 hover:bg-gray-100 dark:hover:bg-white/5"
            }`}
            title="Toggle Customer 360"
          >
            <FileText className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
};
