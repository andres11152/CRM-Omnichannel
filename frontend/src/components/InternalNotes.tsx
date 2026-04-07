import React, { useState, useEffect, useRef } from "react";
import { API_BASE_URL } from "@/services/apiConfig";
import { ContactTimelineView } from "./crm/ContactTimelineView";
import { ContactCRMInfo } from "./ContactCRMInfo";
import { Contact } from "@/types";
import { useMentionInput } from "@/hooks/useMentionInput";
import { useTeamMembers } from "@/hooks/useTeamMembers";
import { MentionAutocomplete } from "./MentionAutocomplete";
import { ConfirmationModal } from "./ui/ConfirmationModal";

interface Note {
  id: string;
  subject: string;
  description: string;
  createdBy: { name: string };
  createdAt: string;
  mentions?: Array<{ id: string; name: string; email: string }>;
}

interface Props {
  contactId: string;
  contactName?: string;
  contactPhone?: string;
  contact?: Contact; // Full contact object for CRM info
  onEditContact?: () => void;
  className?: string;
}

const InternalNotesComponent: React.FC<Props> = ({
  contactId,
  contactName,
  contactPhone,
  contact,
  onEditContact,
  className,
}) => {
  const [notes, setNotes] = useState<Note[]>([]);
  const [newNote, setNewNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [showTimeline, setShowTimeline] = useState(false);
  // ️ Modal State
  const [noteToDelete, setNoteToDelete] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // [CHAT] Mention Support
  const { teamMembers } = useTeamMembers();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const mentionInput = useMentionInput({
    value: newNote,
    onChange: setNewNote,
    teamMembers,
  });

  // Helper to validate CRM ID (supports UUID and CUID)
  // CUIDs are usually 25 chars starting with 'c'. UUIDs are 36 chars. Phone numbers are usually < 16 digits.
  const isValidCRMId = (id: string) =>
    id && id.length >= 20 && !/^\d+$/.test(id);

  // Strict check: Only allow notes if we have a valid CRM Contact ID (either passed as ID or in the contact object)
  const isContactSaved = Boolean(
    (contact?.realContactId && isValidCRMId(contact.realContactId)) ||
    (contactId && isValidCRMId(contactId)),
  );

  const fetchNotes = async () => {
    if (!contactId) return;
    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(
        `${API_BASE_URL}/activities?contactId=${contactId}&type=NOTE`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      const data = await res.json();
      if (data.status === "success") {
        setNotes(
          data.data.activities.map(
            (a: {
              id: string;
              type: string;
              content: string;
              createdAt: string;
              subject?: string;
              description?: string;
              createdBy?: { name: string };
              mentions?: Array<{ id: string; name: string; email: string }>;
              user?: { name?: string };
            }) => ({
              id: a.id,
              subject: a.subject,
              description: a.description,
              createdBy: a.createdBy,
              createdAt: a.createdAt,
              mentions: a.mentions || [],
            }),
          ),
        );
      }
    } catch (error) {
      console.error("Error fetching notes", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotes();
  }, [contactId]);

  const handleAddNote = async () => {
    if (!newNote.trim()) return;

    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_BASE_URL}/activities`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          contactId,
          type: "NOTE",
          subject: "Nota Interna",
          description: newNote,
          status: "COMPLETED",
        }),
      });

      if (res.ok) {
        setNewNote("");
        fetchNotes();
      }
    } catch (error) {
      console.error("Error creating note", error);
    }
  };

  const handleDeleteClick = (id: string) => {
    setNoteToDelete(id);
  };

  const confirmDeleteNote = async () => {
    if (!noteToDelete) return;
    setIsDeleting(true);
    try {
      const token = localStorage.getItem("token");
      await fetch(`${API_BASE_URL}/activities/${noteToDelete}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      setNotes((prev) => prev.filter((n) => n.id !== noteToDelete));
      setNoteToDelete(null);
    } catch (error) {
      console.error("Error deleting note", error);
    } finally {
      setIsDeleting(false);
    }
  };

  const startEdit = (note: Note) => {
    setEditingId(note.id);
    setEditContent(note.description);
  };

  const handleUpdateNote = async () => {
    if (!editingId || !editContent.trim()) return;
    try {
      const token = localStorage.getItem("token");
      await fetch(`${API_BASE_URL}/activities/${editingId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ description: editContent }),
      });
      setEditingId(null);
      fetchNotes();
    } catch (error) {
      console.error("Error updating note", error);
    }
  };

  return (
    <>
      <div
        className={`flex flex-col h-full bg-yellow-50 dark:bg-reply-panel-dark border-l border-gray-200 dark:border-reply-border-dark flex-shrink-0 transition-colors ${className || "w-72"}`}
      >
        {/* CRM Contact Info Section */}
        {contact && (
          <ContactCRMInfo
            contact={contact}
            onOpenTimeline={() => setShowTimeline(true)}
          />
        )}

        {/* Notas Internas Header */}
        <div className="px-4 py-3 border-b border-yellow-100 dark:border-reply-border-dark bg-yellow-100 dark:bg-reply-border-dark">
          <h3 className="font-bold text-yellow-800 dark:text-yellow-400 flex items-center gap-2">
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
              />
            </svg>
            Notas Internas
          </h3>
          <p className="text-[10px] text-yellow-700 dark:text-gray-400 mt-1">
            Solo visibles para el equipo.
          </p>
        </div>

        {/* Note Input */}
        <div className="p-3">
          {!isContactSaved ? (
            <div className="bg-yellow-100 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-700 rounded-lg p-4 text-center">
              <div className="mb-2 text-yellow-600 dark:text-yellow-400">
                <svg
                  className="w-8 h-8 mx-auto mb-1 opacity-80"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
                <span className="text-xs font-bold block">
                  Contacto No Guardado
                </span>
              </div>
              <p className="text-[10px] text-yellow-700 dark:text-gray-300 mb-3 leading-tight">
                Para agregar notas, primero debes guardar este contacto en el
                CRM.
              </p>
              <button
                onClick={onEditContact}
                className="w-full bg-yellow-600 hover:bg-yellow-700 text-white text-xs font-bold py-2 px-3 rounded shadow-sm transition-colors"
              >
                Guardar Contacto
              </button>
            </div>
          ) : (
            <>
            <div className="relative">
              <textarea
                ref={textareaRef}
                value={newNote}
                onChange={mentionInput.handleChange}
                onKeyDown={mentionInput.handleKeyDown}
                placeholder="Escribe una nota mencionando un compañero con @..."
                className="w-full p-2 text-sm border border-yellow-200 dark:border-gray-600 rounded-lg bg-white dark:bg-reply-surface-dark text-gray-800 dark:text-gray-200 focus:ring-2 focus:ring-yellow-400 focus:border-transparent resize-none h-24 placeholder-gray-400"
              />
              
              {mentionInput.showSuggestions && (
                <MentionAutocomplete
                  suggestions={mentionInput.suggestions}
                  selectedIndex={mentionInput.selectedIndex}
                  onSelect={mentionInput.insertMention}
                  onClose={() => mentionInput.setShowSuggestions(false)}
                />
              )}

              <button
                onClick={handleAddNote}
                disabled={!newNote.trim()}
                className="mt-2 w-full bg-yellow-500 hover:bg-yellow-600 text-white font-bold py-1.5 px-3 rounded text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
              >
                Agregar Nota
              </button>
            </div>
            </>
          )}
        </div>

        {/* Notes List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {loading ? (
            <div className="text-center text-gray-400 text-xs">Cargando...</div>
          ) : notes.length === 0 ? (
            <div className="text-center text-gray-400 text-xs mt-4">
              No hay notas aún.
            </div>
          ) : (
            notes.map((note) => (
              <div
                key={note.id}
                className="bg-white dark:bg-reply-surface-dark p-3 rounded-lg shadow-sm border border-yellow-100 dark:border-reply-border-dark group relative"
              >
                {editingId === note.id ? (
                  <div>
                    <textarea
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      className="w-full p-1 text-sm border rounded bg-reply-bg dark:bg-gray-800 dark:text-white"
                    />
                    <div className="flex justify-end gap-2 mt-2">
                      <button
                        onClick={() => setEditingId(null)}
                        className="text-xs text-gray-500"
                      >
                        Cancelar
                      </button>
                      <button
                        onClick={handleUpdateNote}
                        className="text-xs bg-green-500 text-white px-2 py-1 rounded"
                      >
                        Guardar
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="text-sm text-gray-800 dark:text-gray-300 whitespace-pre-wrap">
                      {note.description}
                    </p>
                    <div className="flex justify-between items-center mt-2 text-[10px] text-gray-400">
                      <span className="font-bold text-gray-500 dark:text-gray-500">
                        {note.createdBy?.name || "Agente"}
                      </span>
                      <span>
                        {new Date(note.createdAt).toLocaleDateString()}
                      </span>
                    </div>

                    <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                      <button
                        onClick={() => startEdit(note)}
                        className="text-blue-400 hover:text-blue-600 p-1"
                        title="Editar"
                      >
                        <svg
                          className="w-3 h-3"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                          />
                        </svg>
                      </button>
                      <button
                        onClick={() => handleDeleteClick(note.id)}
                        className="text-red-400 hover:text-red-600 p-1"
                        title="Eliminar"
                      >
                        <svg
                          className="w-3 h-3"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                          />
                        </svg>
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Timeline Modal */}
      {showTimeline && (
        <ContactTimelineView
          contactId={contactId}
          onClose={() => setShowTimeline(false)}
        />
      )}

      {/* Delete Confirmation Modal */}
      <ConfirmationModal
        isOpen={!!noteToDelete}
        title="¿Eliminar Nota Interna?"
        message="Esta acción no se puede deshacer. La nota será eliminada permanentemente del historial del cliente."
        confirmText="Eliminar Nota"
        cancelText="Cancelar"
        variant="danger"
        isLoading={isDeleting}
        onConfirm={confirmDeleteNote}
        onCancel={() => setNoteToDelete(null)}
      />
    </>
  );
};

export const InternalNotes = React.memo(InternalNotesComponent);
