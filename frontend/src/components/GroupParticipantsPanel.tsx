import React, { useState, useEffect, useMemo } from "react";
import { toast } from "sonner";
import { fetchAPI } from "@/services/apiConfig";
import { 
  Users, 
  X, 
  Search, 
  UserPlus, 
  CheckCircle2, 
  ShieldCheck, 
  ShieldAlert,
  Info,
  RefreshCcw,
  UserCheck
} from "lucide-react";
import { Avatar } from "@/components/common/Avatar";

interface GroupParticipant {
  jid: string;
  phone: string | null;
  displayName: string;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  canAddToCRM: boolean;
  existsInCRM: boolean;
  contactId: string | null;
}

interface GroupData {
  groupId: string;
  groupName: string;
  participantCount: number;
  participants: GroupParticipant[];
  addableCount: number;
  existingCount: number;
  syncEnabled?: boolean;
}

interface Props {
  conversationId: string;
  onClose: () => void;
}

/**
 * [UX] BRUTAL GROUP PARTICIPANTS PANEL
 * Premium interface for group extraction and CRM management.
 */
export const GroupParticipantsPanel: React.FC<Props> = ({
  conversationId,
  onClose,
}) => {
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [data, setData] = useState<GroupData | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const fetchParticipants = async () => {
    try {
      setLoading(true);
      const res = await fetchAPI(
        `/conversations/${conversationId}/participants`,
      );
      setData(res.data);
    } catch (error) {
      console.error("Failed to fetch participants", error);
      toast.error("Error al cargar participantes");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchParticipants();
  }, [conversationId]);

  // Search Logic
  const filteredParticipants = useMemo(() => {
    if (!data) return [];
    if (!searchQuery.trim()) return data.participants;
    
    const query = searchQuery.toLowerCase();
    return data.participants.filter(p => 
      p.displayName.toLowerCase().includes(query) || 
      (p.phone && p.phone.includes(query)) ||
      p.jid.toLowerCase().includes(query)
    );
  }, [data, searchQuery]);

  const handleAddOne = async (participant: GroupParticipant) => {
    if (!participant.canAddToCRM || participant.existsInCRM) return;
    try {
      setProcessing(true);
      await fetchAPI(
        `/conversations/${conversationId}/participants/add-to-crm`,
        {
          method: "POST",
          body: JSON.stringify({
            jid: participant.jid,
            customName: participant.displayName,
          }),
        },
      );
      toast.success(`Contacto añadido: ${participant.displayName}`);
      
      // Update local state
      setData((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          existingCount: prev.existingCount + 1,
          addableCount: prev.addableCount - 1,
          participants: prev.participants.map((p) =>
            p.jid === participant.jid
              ? { ...p, existsInCRM: true, canAddToCRM: false }
              : p
          ),
        };
      });
    } catch (error) {
      toast.error("Error al añadir contacto");
    } finally {
      setProcessing(false);
    }
  };

  const handleAddAll = async () => {
    if (!data || data.addableCount === 0) return;
    
    try {
      setProcessing(true);
      const res = await fetchAPI(
        `/conversations/${conversationId}/participants/add-all`,
        {
          method: "POST",
          body: JSON.stringify({}),
        },
      );
      toast.success(res.message);
      fetchParticipants(); // Full refresh
    } catch (error) {
      toast.error("Error al añadir contactos masivamente");
    } finally {
      setProcessing(false);
    }
  };

  const handleToggleSync = async (enabled: boolean) => {
    try {
      setProcessing(true);
      const { chatService } = await import("@/services/chatService");
      await chatService.toggleGroupSync(conversationId, enabled);

      setData((prev) => (prev ? { ...prev, syncEnabled: enabled } : null));

      toast.success(
        enabled
          ? "Sincronización automática ACTIVADA"
          : "Sincronización automática DESACTIVADA",
      );
    } catch (error) {
      toast.error("Error al actualizar preferencia de sincronización");
    } finally {
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <div className="h-full w-96 flex flex-col items-center justify-center p-8 bg-white dark:bg-reply-panel-dark border-l border-gray-200 dark:border-white/5 animate-in fade-in duration-300">
        <div className="relative">
          <div className="w-12 h-12 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
          <Users className="w-5 h-5 text-indigo-500 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
        </div>
        <p className="mt-4 text-sm font-bold text-gray-500 dark:text-gray-400">Analizando grupo...</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="h-full w-96 flex flex-col items-center justify-center p-8 bg-white dark:bg-reply-panel-dark border-l border-gray-200 dark:border-white/5">
        <ShieldAlert className="w-12 h-12 text-red-400 mb-4" />
        <p className="text-sm font-medium text-gray-500 text-center">No se pudo cargar la información del grupo.</p>
        <button 
          onClick={fetchParticipants}
          className="mt-4 flex items-center gap-2 text-indigo-500 font-bold text-xs hover:underline"
        >
          <RefreshCcw className="w-3.5 h-3.5" /> Reintentar
        </button>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-white dark:bg-[#0b141a] border-l border-gray-200 dark:border-white/5 w-96 shadow-2xl z-20 overflow-hidden animate-in slide-in-from-right duration-300">
      
      {/* Header - Glassmorphism style */}
      <div className="p-5 border-b border-gray-100 dark:border-white/5 bg-white/80 dark:bg-[#0b141a]/80 backdrop-blur-md sticky top-0 z-10">
        <div className="flex justify-between items-start mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-900/20 flex items-center justify-center border border-indigo-100 dark:border-indigo-800/50">
              <Users className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <h3 className="font-bold text-gray-900 dark:text-white text-[15px]">
                Participantes
              </h3>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 font-medium truncate max-w-[200px]">
                {data.groupName}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-gray-100 dark:hover:bg-white/10 rounded-full text-gray-400 hover:text-gray-600 dark:hover:text-white transition-all transform active:scale-95"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Sync Settings */}
        <div className="p-3 bg-gray-50/50 dark:bg-white/5 rounded-xl border border-gray-100 dark:border-white/5">
          <label className="flex items-center justify-between cursor-pointer">
            <div className="flex-1 pr-4">
              <span className="text-[11px] font-bold text-gray-700 dark:text-gray-200 flex items-center gap-1.5 uppercase tracking-wider">
                Sincronización Total
              </span>
              <span className="text-[10px] text-gray-500 dark:text-gray-400 leading-tight block mt-0.5">
                Auto-guardar miembros nuevos en el CRM
              </span>
            </div>

            <div className="relative inline-flex items-center">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={data.syncEnabled ?? true}
                onChange={(e) => handleToggleSync(e.target.checked)}
                disabled={processing}
              />
              <div className="w-9 h-5 bg-gray-200 dark:bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500 transition-colors"></div>
            </div>
          </label>
        </div>
      </div>

      {/* Bulk Action Area */}
      {data.addableCount > 0 && (
        <div className="px-5 py-4 bg-gradient-to-br from-indigo-50 via-white to-transparent dark:from-indigo-900/10 dark:via-transparent dark:to-transparent border-b border-indigo-50 dark:border-white/5">
          <div className="flex justify-between items-center text-[11px] font-bold mb-3 tracking-wider uppercase">
            <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400">
              <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
              Disponibles: {data.addableCount}
            </div>
            <div className="text-emerald-600 dark:text-emerald-400 flex items-center gap-2">
              <UserCheck className="w-3.5 h-3.5" />
              CRM: {data.existingCount}
            </div>
          </div>
          <button
            onClick={handleAddAll}
            disabled={processing}
            className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-lg shadow-indigo-500/20 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 flex justify-center items-center gap-2"
          >
            {processing ? (
              <RefreshCcw className="w-4 h-4 animate-spin" />
            ) : (
              <UserPlus className="w-4 h-4" />
            )}
            Importar {data.addableCount} Contactos Nuevos
          </button>
        </div>
      )}

      {/* Search Bar */}
      <div className="px-5 py-3 sticky top-[168px] z-10 bg-white/50 dark:bg-[#0b141a]/50 backdrop-blur-sm">
        <div className="relative group">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-indigo-500 transition-colors" />
          <input 
            type="text" 
            placeholder="Buscar por nombre o número..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-gray-50 dark:bg-white/5 border border-gray-100 dark:border-white/5 rounded-xl text-xs text-gray-800 dark:text-white placeholder-gray-400 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
          />
        </div>
      </div>

      {/* List Container */}
      <div className="flex-1 overflow-y-auto px-3 pb-6 custom-scrollbar">
        {filteredParticipants.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="w-16 h-16 bg-gray-50 dark:bg-white/5 rounded-full flex items-center justify-center mb-4">
              <Search className="w-8 h-8 text-gray-300" />
            </div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Sin resultados</p>
          </div>
        ) : (
          <div className="space-y-1">
            {filteredParticipants.map((p) => (
              <div
                key={p.jid}
                className="group relative flex items-center gap-3 p-3 rounded-2xl hover:bg-gray-50 dark:hover:bg-white/5 border border-transparent hover:border-gray-100 dark:hover:border-white/5 transition-all duration-200"
              >
                {/* Avatar Column */}
                <div className="relative">
                  <Avatar 
                    name={p.displayName} 
                    className="w-10 h-10 border-2 border-white dark:border-gray-800 shadow-sm"
                  />
                  {(p.isAdmin || p.isSuperAdmin) && (
                    <div className="absolute -bottom-1 -right-1 p-0.5 bg-white dark:bg-gray-900 rounded-full">
                      <div className={`p-0.5 rounded-full ${p.isSuperAdmin ? 'bg-amber-100 text-amber-600' : 'bg-blue-100 text-blue-600'} dark:bg-opacity-20` }>
                        <ShieldCheck className="w-3 h-3" />
                      </div>
                    </div>
                  )}
                </div>

                {/* Info Column */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[13px] font-bold text-gray-800 dark:text-gray-100 truncate">
                      {p.displayName}
                    </span>
                    {p.isSuperAdmin && (
                      <span className="text-[9px] bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 px-1.5 py-0.5 rounded-md font-bold uppercase border border-amber-100 dark:border-amber-900/50">
                        Creador
                      </span>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-2 mt-0.5">
                    {p.phone ? (
                      <span className="text-[11px] text-gray-500 dark:text-gray-400 font-mono tracking-tighter">
                        +{p.phone}
                      </span>
                    ) : (
                      <div className="flex items-center gap-1 group/lid" title={p.jid}>
                        <span className="text-[10px] text-gray-400 dark:text-gray-500 italic bg-gray-100 dark:bg-white/5 px-1.5 py-0.5 rounded cursor-help">
                           ID Protegido
                        </span>
                        <Info className="w-3 h-3 text-gray-300 opacity-0 group-hover/lid:opacity-100 transition-opacity" />
                      </div>
                    )}
                  </div>
                </div>

                {/* Action Column */}
                <div className="flex items-center">
                  {p.existsInCRM ? (
                    <div className="p-2 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-500 rounded-xl" title="En CRM">
                      <CheckCircle2 className="w-5 h-5" />
                    </div>
                  ) : p.canAddToCRM ? (
                    <button
                      onClick={() => handleAddOne(p)}
                      disabled={processing}
                      className="p-2.5 bg-gray-50 dark:bg-white/5 text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-xl transition-all transform hover:rotate-12 active:scale-95"
                      title="Importar al CRM"
                    >
                      <UserPlus className="w-5 h-5" />
                    </button>
                  ) : (
                    <div 
                      className="p-2.5 text-gray-200 dark:text-gray-800"
                      title="Sin número real detectable"
                    >
                      <UserPlus className="w-5 h-5 opacity-20" />
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer Info */}
      <div className="p-4 bg-gray-50 dark:bg-white/5 border-t border-gray-100 dark:border-white/5 flex items-center gap-3">
        <div className="p-2 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 text-indigo-500">
          <Info className="w-4 h-4" />
        </div>
        <p className="text-[10px] text-gray-500 dark:text-gray-400 leading-tight">
          WhatsApp oculta los números reales de algunos miembros para proteger su privacidad en comunidades y grupos grandes.
        </p>
      </div>
    </div>
  );
};
