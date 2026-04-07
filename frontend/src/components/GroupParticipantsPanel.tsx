import React, { useState, useEffect } from "react";
import { toast } from "sonner";
import { fetchAPI } from "@/services/apiConfig";

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

export const GroupParticipantsPanel: React.FC<Props> = ({
  conversationId,
  onClose,
}) => {
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [data, setData] = useState<GroupData | null>(null);

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
      // Refresh local state without full reload
      setData((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          existingCount: prev.existingCount + 1,
          addableCount: prev.addableCount - 1,
          participants: prev.participants.map((p) =>
            p.jid === participant.jid
              ? { ...p, existsInCRM: true, canAddToCRM: false }
              : p,
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
    const confirm = window.confirm(
      `¿Estás seguro de añadir ${data.addableCount} contactos al CRM?`,
    );
    if (!confirm) return;

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
      <div className="h-full flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-4 text-center text-gray-500">
        No se pudo cargar la información del grupo.
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-white dark:bg-reply-bg-dark border-l border-gray-200 dark:border-reply-border-dark w-80 shadow-xl z-20">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 dark:border-reply-border-dark flex justify-between items-center bg-reply-bg dark:bg-reply-surface-dark">
        <div>
          <h3 className="font-bold text-gray-900 dark:text-gray-100 text-sm">
            Participantes ({data.participantCount})
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-[200px]">
            {data.groupName}
          </p>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg text-gray-500 transition-colors"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>

      {/* [SYNC] SYNC SETTINGS SECTION */}
      <div className="p-4 border-b border-gray-100 dark:border-reply-border-dark bg-reply-bg dark:bg-reply-surface-dark/50">
        <label className="flex items-center justify-between cursor-pointer group">
          <div className="flex-1 pr-4">
            <span className="text-xs font-bold text-gray-800 dark:text-gray-200 block mb-0.5">
              Sincronización Automática
            </span>
            <span className="text-[10px] text-gray-500 dark:text-gray-400 leading-tight block">
              Guardar automáticamente participantes nuevos como contactos del
              CRM.
            </span>
          </div>

          <div className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              className="sr-only peer"
              checked={data.syncEnabled ?? true}
              onChange={(e) => handleToggleSync(e.target.checked)}
              disabled={processing}
            />
            <div className="w-10 h-5 bg-gray-200 dark:bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600 transition-colors"></div>
          </div>
        </label>
      </div>

      {/* Stats / Bulk Action */}
      <div className="p-4 bg-indigo-50 dark:bg-indigo-900/10 border-b border-indigo-100 dark:border-indigo-900/30">
        <div className="flex justify-between items-center text-xs mb-3">
          <span className="text-gray-600 dark:text-gray-300">
            Nuevos disponibles: <strong>{data.addableCount}</strong>
          </span>
          <span className="text-green-600 dark:text-green-400">
            En CRM: <strong>{data.existingCount}</strong>
          </span>
        </div>
        <button
          onClick={handleAddAll}
          disabled={data.addableCount === 0 || processing}
          className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2"
        >
          {processing ? (
            <div className="animate-spin h-3 w-3 border-2 border-white/30 border-t-white rounded-full"></div>
          ) : (
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 4v16m8-8H4"
              />
            </svg>
          )}
          Añadir Todos ({data.addableCount})
        </button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {data.participants.map((p) => (
          <div
            key={p.jid}
            className="group flex justify-between items-center p-2.5 rounded-lg hover:bg-reply-bg dark:hover:bg-[#1a202c] border border-transparent hover:border-gray-200 dark:hover:border-gray-700 transition-all"
          >
            <div className="flex-1 min-w-0 pr-2">
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-medium text-gray-900 dark:text-gray-200 truncate">
                  {p.displayName}
                </span>
                {p.isSuperAdmin && (
                  <span className="text-[10px] bg-yellow-100 text-yellow-800 px-1.5 py-0.5 rounded border border-yellow-200">
                    Creador
                  </span>
                )}
                {p.isAdmin && !p.isSuperAdmin && (
                  <span className="text-[10px] bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded border border-blue-200">
                    Admin
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 font-mono">
                {p.phone ? `+${p.phone}` : "ID Oculto/LID"}
              </p>
            </div>

            <div className="flex-shrink-0">
              {p.existsInCRM ? (
                <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400">
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                </span>
              ) : p.canAddToCRM ? (
                <button
                  onClick={() => handleAddOne(p)}
                  disabled={processing}
                  className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 transition-colors"
                  title="Añadir al CRM"
                >
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 4v16m8-8H4"
                    />
                  </svg>
                </button>
              ) : (
                <span
                  title="No se puede añadir (Número inválido o LID)"
                  className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-400"
                >
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
                    />
                  </svg>
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
