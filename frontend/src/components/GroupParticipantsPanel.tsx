import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useTranslation } from "react-i18next";
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
  UserCheck,
  CheckSquare,
  Square,
  Download,
  MinusSquare,
  UserMinus,
  ShieldOff,
  Link2,
  LogOut,
  Copy
} from "lucide-react";
import { Avatar } from "@/components/common/Avatar";
import { ConfirmationModal } from "@/components/ui/ConfirmationModal";

interface GroupParticipant {
  jid: string;
  phone: string | null;
  isLid: boolean;
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
 * [UX] ENTERPRISE GROUP PARTICIPANTS PANEL
 * Premium interface for selective group extraction and CRM management.
 * Supports: Select All, Select Filtered, Individual Select, Bulk Import
 */
export const GroupParticipantsPanel: React.FC<Props> = ({
  conversationId,
  onClose,
}) => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [data, setData] = useState<GroupData | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedJids, setSelectedJids] = useState<Set<string>>(new Set());

  const fetchParticipants = async () => {
    try {
      setLoading(true);
      const res = await fetchAPI<{ data: GroupData }>(
        `/conversations/${conversationId}/participants`,
      );
      setData(res.data);
      setSelectedJids(new Set()); // Reset selection on refresh
    } catch (error) {
      console.error("Failed to fetch participants", error);
      toast.error(t("group_participants_panel.toast.load_error", "Error al cargar participantes"));
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

  // Selectable participants (can add to CRM and not already there)
  const selectableParticipants = useMemo(() => {
    return filteredParticipants.filter(p => p.canAddToCRM && !p.existsInCRM);
  }, [filteredParticipants]);

  // Selection stats
  const selectedCount = selectedJids.size;
  const allSelectableSelected = selectableParticipants.length > 0 && 
    selectableParticipants.every(p => selectedJids.has(p.jid));
  const someSelected = selectableParticipants.some(p => selectedJids.has(p.jid));

  // Toggle single selection
  const toggleSelect = useCallback((jid: string) => {
    setSelectedJids(prev => {
      const next = new Set(prev);
      if (next.has(jid)) {
        next.delete(jid);
      } else {
        next.add(jid);
      }
      return next;
    });
  }, []);

  // Toggle all selectable (within current filter)
  const toggleSelectAll = useCallback(() => {
    if (allSelectableSelected) {
      // Deselect all visible
      setSelectedJids(prev => {
        const next = new Set(prev);
        selectableParticipants.forEach(p => next.delete(p.jid));
        return next;
      });
    } else {
      // Select all visible
      setSelectedJids(prev => {
        const next = new Set(prev);
        selectableParticipants.forEach(p => next.add(p.jid));
        return next;
      });
    }
  }, [allSelectableSelected, selectableParticipants]);

  // Add single participant
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
      toast.success(t("group_participants_panel.toast.add_success", "Contacto añadido"));
      
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
      // Remove from selection
      setSelectedJids(prev => {
        const next = new Set(prev);
        next.delete(participant.jid);
        return next;
      });
    } catch (error) {
      toast.error(t("group_participants_panel.toast.add_error", "Error al añadir contacto"));
    } finally {
      setProcessing(false);
    }
  };

  // Import selected participants (bulk)
  const handleImportSelected = async () => {
    if (selectedCount === 0 || !data) return;
    
    const participantsToImport = data.participants
      .filter(p => selectedJids.has(p.jid) && p.canAddToCRM && !p.existsInCRM)
      .map(p => ({
        jid: p.jid,
        customName: p.displayName,
        tags: ["Importado de Grupo"],
      }));

    if (participantsToImport.length === 0) {
      toast.info(t("group_participants_panel.toast.no_valid_contacts", "Sin contactos válidos"));
      return;
    }

    try {
      setProcessing(true);
      const res = await fetchAPI<{ data: { successful: number } }>(
        `/conversations/${conversationId}/participants/add-bulk`,
        {
          method: "POST",
          body: JSON.stringify({ participants: participantsToImport }),
        },
      );
      
      const result = res.data;
      toast.success(t("group_participants_panel.toast.bulk_imported", "{{count}} contactos importados", { count: result.successful }));
      
      // Update local state
      setData((prev) => {
        if (!prev) return null;
        const importedJids = new Set(participantsToImport.map(p => p.jid));
        return {
          ...prev,
          existingCount: prev.existingCount + result.successful,
          addableCount: prev.addableCount - result.successful,
          participants: prev.participants.map((p) =>
            importedJids.has(p.jid)
              ? { ...p, existsInCRM: true, canAddToCRM: false }
              : p
          ),
        };
      });
      setSelectedJids(new Set()); // Clear selection
    } catch (error) {
      toast.error(t("group_participants_panel.toast.bulk_import_error", "Error al importar contactos"));
    } finally {
      setProcessing(false);
    }
  };

  // Import ALL valid participants
  const handleAddAll = async () => {
    if (!data || data.addableCount === 0) return;
    
    try {
      setProcessing(true);
      const res = await fetchAPI<{ message?: string; data?: { successful: number } }>(
        `/conversations/${conversationId}/participants/add-all`,
        {
          method: "POST",
          body: JSON.stringify({}),
        },
      );
      toast.success(res.message || t("group_participants_panel.toast.bulk_imported", "{{count}} contactos importados", { count: res.data?.successful || 0 }));
      fetchParticipants(); // Full refresh
    } catch (error) {
      toast.error(t("group_participants_panel.toast.bulk_add_all_error", "Error al añadir contactos masivamente"));
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
          ? t("group_participants_panel.toast.sync_enabled", "Sincronización automática ACTIVADA")
          : t("group_participants_panel.toast.sync_disabled", "Sincronización automática DESACTIVADA"),
      );
    } catch (error) {
      toast.error(t("group_participants_panel.toast.sync_update_error", "Error al actualizar preferencia"));
    } finally {
      setProcessing(false);
    }
  };

  // [SEC] Real WhatsApp group mutations — gated server-side by
  // WA_ENABLE_GROUP_MANAGEMENT (default off). If disabled, these calls fail
  // with a clear error surfaced via toast, same as any other failed action.
  const handleRemoveParticipant = async (participant: GroupParticipant) => {
    if (!participant.phone) {
      toast.error(t("group_participants_panel.toast.remove_no_phone", "No se puede quitar: número no disponible (LID oculto)"));
      return;
    }
    try {
      setProcessing(true);
      await fetchAPI(`/conversations/${conversationId}/group/participants`, {
        method: "PATCH",
        body: JSON.stringify({ phones: [participant.phone], action: "remove" }),
      });
      toast.success(t("group_participants_panel.toast.removed", "{{name}} fue quitado del grupo", { name: participant.displayName }));
      setData((prev) =>
        prev
          ? { ...prev, participants: prev.participants.filter((p) => p.jid !== participant.jid), participantCount: prev.participantCount - 1 }
          : null,
      );
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : t("group_participants_panel.toast.remove_error", "Error al quitar del grupo");
      toast.error(msg);
    } finally {
      setProcessing(false);
    }
  };

  const handleToggleAdmin = async (participant: GroupParticipant) => {
    if (!participant.phone) {
      toast.error(t("group_participants_panel.toast.modify_no_phone", "No se puede modificar: número no disponible (LID oculto)"));
      return;
    }
    const action = participant.isAdmin ? "demote" : "promote";
    try {
      setProcessing(true);
      await fetchAPI(`/conversations/${conversationId}/group/participants`, {
        method: "PATCH",
        body: JSON.stringify({ phones: [participant.phone], action }),
      });
      toast.success(participant.isAdmin ? t("group_participants_panel.toast.demoted", "{{name}} ya no es admin", { name: participant.displayName }) : t("group_participants_panel.toast.promoted", "{{name}} ahora es admin", { name: participant.displayName }));
      setData((prev) =>
        prev
          ? { ...prev, participants: prev.participants.map((p) => (p.jid === participant.jid ? { ...p, isAdmin: !p.isAdmin } : p)) }
          : null,
      );
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : t("group_participants_panel.toast.role_update_error", "Error al actualizar el rol");
      toast.error(msg);
    } finally {
      setProcessing(false);
    }
  };

  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [loadingInvite, setLoadingInvite] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [leaving, setLeaving] = useState(false);

  const handleGetInviteLink = async () => {
    try {
      setLoadingInvite(true);
      const res = await fetchAPI<{ data: { inviteLink: string } }>(`/conversations/${conversationId}/group/invite-code`);
      setInviteLink(res.data.inviteLink);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : t("group_participants_panel.toast.invite_link_error", "Error al obtener el enlace de invitación");
      toast.error(msg);
    } finally {
      setLoadingInvite(false);
    }
  };

  const handleCopyInviteLink = () => {
    if (!inviteLink) return;
    navigator.clipboard.writeText(inviteLink);
    toast.success(t("group_participants_panel.toast.invite_copied", "Enlace copiado"));
  };

  const handleLeaveGroup = async () => {
    try {
      setLeaving(true);
      await fetchAPI(`/conversations/${conversationId}/group/leave`, { method: "POST" });
      toast.success(t("group_participants_panel.toast.left_group", "Saliste del grupo"));
      setShowLeaveConfirm(false);
      onClose();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : t("group_participants_panel.toast.leave_error", "Error al salir del grupo");
      toast.error(msg);
    } finally {
      setLeaving(false);
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
    <div className="h-full flex flex-col bg-white dark:bg-reply-bg-dark border-l border-gray-200 dark:border-white/5 w-96 shadow-2xl z-20 overflow-hidden animate-in slide-in-from-right duration-300">
      
      {/* Header - Glassmorphism style */}
      <div className="p-5 border-b border-gray-100 dark:border-white/5 bg-white/80 dark:bg-reply-bg-dark/80 backdrop-blur-md sticky top-0 z-10">
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

        {/* Sync Settings — Defaults OFF to prevent spam */}
        <div className="p-3 bg-gray-50/50 dark:bg-white/5 rounded-xl border border-gray-100 dark:border-white/5">
          <label className="flex items-center justify-between cursor-pointer">
            <div className="flex-1 pr-4">
              <span className="text-[11px] font-bold text-gray-700 dark:text-gray-200 flex items-center gap-1.5 uppercase tracking-wider">
                Sincronización Automática
              </span>
              <span className="text-[10px] text-gray-500 dark:text-gray-400 leading-tight block mt-0.5">
                Auto-guardar miembros nuevos en el CRM
              </span>
            </div>

            <div className="relative inline-flex items-center">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={data.syncEnabled ?? false}
                onChange={(e) => handleToggleSync(e.target.checked)}
                disabled={processing}
              />
              <div className="w-9 h-5 bg-gray-200 dark:bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500 transition-colors"></div>
            </div>
          </label>
        </div>
      </div>

      {/* Stats & Selection Bar */}
      <div className="px-5 py-3 bg-gradient-to-br from-indigo-50 via-white to-transparent dark:from-indigo-900/10 dark:via-transparent dark:to-transparent border-b border-indigo-50 dark:border-white/5">
        {/* Counters */}
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

        {/* Action Buttons Row */}
        <div className="flex gap-2">
          {/* Import Selected Button */}
          {selectedCount > 0 ? (
            <button
              onClick={handleImportSelected}
              disabled={processing}
              className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-lg shadow-indigo-500/20 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 flex justify-center items-center gap-2"
            >
              {processing ? (
                <RefreshCcw className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              Importar {selectedCount} Seleccionados
            </button>
          ) : (
            <button
              onClick={handleAddAll}
              disabled={processing || data.addableCount === 0}
              className="flex-1 py-2.5 bg-gray-100 dark:bg-white/5 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 text-gray-600 dark:text-gray-300 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-xl text-xs font-bold transition-all active:scale-[0.98] disabled:opacity-30 flex justify-center items-center gap-2 border border-gray-200 dark:border-white/10"
            >
              <UserPlus className="w-4 h-4" />
              Importar Todos ({data.addableCount})
            </button>
          )}
        </div>
      </div>

      {/* Search Bar + Select All */}
      <div className="px-5 py-3 sticky top-[168px] z-10 bg-white/50 dark:bg-reply-bg-dark/50 backdrop-blur-sm border-b border-gray-50 dark:border-white/5">
        <div className="flex items-center gap-2">
          {/* Select All Toggle */}
          {selectableParticipants.length > 0 && (
            <button
              onClick={toggleSelectAll}
              className="p-2 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-900/20 text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-all shrink-0"
              title={allSelectableSelected ? "Deseleccionar todos" : "Seleccionar todos disponibles"}
            >
              {allSelectableSelected ? (
                <CheckSquare className="w-5 h-5 text-indigo-500" />
              ) : someSelected ? (
                <MinusSquare className="w-5 h-5 text-indigo-400" />
              ) : (
                <Square className="w-5 h-5" />
              )}
            </button>
          )}
          
          {/* Search */}
          <div className="relative group flex-1">
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
            {filteredParticipants.map((p) => {
              const isSelectable = p.canAddToCRM && !p.existsInCRM;
              const isSelected = selectedJids.has(p.jid);

              return (
                <div
                  key={p.jid}
                  onClick={() => isSelectable && toggleSelect(p.jid)}
                  className={`group relative flex items-center gap-3 p-3 rounded-2xl transition-all duration-200 ${
                    isSelectable ? "cursor-pointer" : ""
                  } ${
                    isSelected 
                      ? "bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800/50 shadow-sm" 
                      : "hover:bg-gray-50 dark:hover:bg-white/5 border border-transparent hover:border-gray-100 dark:hover:border-white/5"
                  }`}
                >
                  {/* Checkbox / Status Column */}
                  <div className="shrink-0 w-6 flex items-center justify-center">
                    {p.existsInCRM ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                    ) : isSelectable ? (
                      <div className={`w-[18px] h-[18px] rounded-md border-2 flex items-center justify-center transition-all ${
                        isSelected 
                          ? "bg-indigo-500 border-indigo-500" 
                          : "border-gray-300 dark:border-gray-600 group-hover:border-indigo-400"
                      }`}>
                        {isSelected && (
                          <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                    ) : (
                      <div className="w-[18px] h-[18px] rounded-md border-2 border-gray-200 dark:border-gray-700 opacity-30" />
                    )}
                  </div>

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
                      {p.existsInCRM && (
                        <span className="text-[9px] bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 px-1.5 py-0.5 rounded-md font-bold uppercase border border-emerald-100 dark:border-emerald-900/50">
                          CRM
                        </span>
                      )}
                    </div>
                    
                    <div className="flex items-center gap-2 mt-0.5">
                      {p.phone && !p.isLid ? (
                        <span className="text-[11px] text-gray-500 dark:text-gray-400 font-mono tracking-tighter">
                          +{p.phone}
                        </span>
                      ) : (
                        <div className="flex items-center gap-1 group/lid" title={p.jid}>
                          <span className="text-[10px] text-gray-400 dark:text-gray-500 italic bg-gray-100 dark:bg-white/5 px-1.5 py-0.5 rounded cursor-help">
                             ID Oculto (Nº Privado)
                          </span>
                          <Info className="w-3 h-3 text-gray-300 opacity-0 group-hover/lid:opacity-100 transition-opacity" />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Row Actions: CRM import + real WhatsApp group actions */}
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {isSelectable && !isSelected && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleAddOne(p);
                        }}
                        disabled={processing}
                        className="p-2 bg-gray-50 dark:bg-white/5 text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-xl transition-all transform hover:rotate-12 active:scale-95"
                        title="Importar directo al CRM"
                      >
                        <UserPlus className="w-4 h-4" />
                      </button>
                    )}
                    {!p.isSuperAdmin && (
                      <>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleAdmin(p);
                          }}
                          disabled={processing}
                          className="p-2 bg-gray-50 dark:bg-white/5 text-gray-400 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded-xl transition-all active:scale-95"
                          title={p.isAdmin ? "Quitar admin" : "Hacer admin"}
                        >
                          {p.isAdmin ? <ShieldOff className="w-4 h-4" /> : <ShieldCheck className="w-4 h-4" />}
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRemoveParticipant(p);
                          }}
                          disabled={processing}
                          className="p-2 bg-gray-50 dark:bg-white/5 text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-all active:scale-95"
                          title="Quitar del grupo"
                        >
                          <UserMinus className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Group Settings: invite link + leave (real WhatsApp group actions) */}
      <div className="p-4 bg-gray-50 dark:bg-white/5 border-t border-gray-100 dark:border-white/5 space-y-2">
        {inviteLink ? (
          <div className="flex items-center gap-2 p-2 bg-white dark:bg-white/5 rounded-lg border border-gray-100 dark:border-white/10">
            <Link2 className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
            <span className="text-[10px] text-gray-600 dark:text-gray-300 truncate flex-1 font-mono">{inviteLink}</span>
            <button onClick={handleCopyInviteLink} className="p-1 text-gray-400 hover:text-indigo-600 transition-colors" title="Copiar">
              <Copy className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <button
            onClick={handleGetInviteLink}
            disabled={loadingInvite}
            className="w-full flex items-center justify-center gap-2 py-2 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-lg transition-colors disabled:opacity-50"
          >
            {loadingInvite ? <RefreshCcw className="w-3.5 h-3.5 animate-spin" /> : <Link2 className="w-3.5 h-3.5" />}
            Obtener enlace de invitación
          </button>
        )}
        <button
          onClick={() => setShowLeaveConfirm(true)}
          className="w-full flex items-center justify-center gap-2 py-2 text-xs font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
        >
          <LogOut className="w-3.5 h-3.5" />
          Salir del grupo
        </button>
      </div>

      {/* Footer Info */}
      <div className="p-4 bg-gray-50 dark:bg-white/5 border-t border-gray-100 dark:border-white/5 flex items-center gap-3">
        <div className="p-2 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 text-indigo-500">
          <Info className="w-4 h-4" />
        </div>
        <p className="text-[10px] text-gray-500 dark:text-gray-400 leading-tight">
          Selecciona los contactos que deseas importar. La sincronización automática está {data.syncEnabled ? "activa" : "desactivada"} — solo los contactos importados manualmente se guardan en tu agenda.
        </p>
      </div>

      <ConfirmationModal
        isOpen={showLeaveConfirm}
        title="Salir del grupo"
        message="El número de WhatsApp conectado saldrá de este grupo. Esta acción no se puede deshacer desde aquí — alguien tendría que volver a invitarlo."
        confirmText="Salir"
        cancelText="Cancelar"
        variant="danger"
        isLoading={leaving}
        onConfirm={handleLeaveGroup}
        onCancel={() => setShowLeaveConfirm(false)}
      />
    </div>
  );
};
