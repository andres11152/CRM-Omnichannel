import React, { useState, useEffect } from "react";
import { Contact, Tag } from "@/types";
import { Modal } from "@/components/ui/Modal";
import { User, X } from "lucide-react";
import { useTranslation } from "react-i18next";

export interface ContactFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  editingContact: Contact | null;
  allTags: Tag[];
  onSave: (contactData: {
    name: string;
    email: string;
    phone: string;
    tagIds: string[];
    notes: string;
  }) => void;
}

export const ContactFormModal: React.FC<ContactFormModalProps> = ({
  isOpen,
  onClose,
  editingContact,
  allTags,
  onSave,
}) => {
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [newNotes, setNewNotes] = useState("");
  const { t } = useTranslation();

  useEffect(() => {
    if (editingContact) {
      setNewName(editingContact.name || "");
      setNewEmail(editingContact.email || "");
      setNewPhone(editingContact.phone || "");
      setSelectedTagIds(editingContact.tags || []);
      setNewNotes(editingContact.notes || "");
    } else {
      setNewName("");
      setNewEmail("");
      setNewPhone("");
      setSelectedTagIds([]);
      setNewNotes("");
    }
  }, [editingContact, isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      name: newName,
      email: newEmail,
      phone: newPhone,
      tagIds: selectedTagIds,
      notes: newNotes,
    });
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={editingContact ? t("common.edit") : t("common.new")}
      subtitle={editingContact ? t("contacts.form.update_desc", "Actualiza la información del cliente") : t("contacts.form.create_desc", "Agrega un nuevo cliente a tu base de datos")}
      size="md"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-3 text-sm font-bold text-gray-600 dark:text-gray-400 hover:bg-white dark:hover:bg-gray-800 border border-transparent hover:border-gray-200 dark:hover:border-gray-700 rounded-xl transition-all"
          >
            {t("common.cancel", "Cancelar")}
          </button>
          <button
            type="submit"
            form="contact-form"
            className="px-8 py-3 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white rounded-xl font-bold shadow-lg shadow-cyan-500/20 hover:shadow-cyan-500/30 transition-all transform hover:-translate-y-0.5"
          >
            {editingContact ? t("common.save_changes", "Guardar Cambios") : t("contacts.form.create_action", "Crear Contacto")}
          </button>
        </>
      }
    >
      <form
        id="contact-form"
        onSubmit={handleSubmit}
        className="space-y-6"
      >
        <div className="space-y-5">
          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
              {t("common.name")} <span className="text-red-500">*</span>
            </label>
            <div className="relative group">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <User className="h-5 w-5 text-gray-400 group-focus-within:text-cyan-500 transition-colors" />
              </div>
              <input
                required
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Ej. Juan Pérez"
                className="w-full pl-12 pr-4 py-3.5 bg-reply-bg dark:bg-gray-800/50 border border-gray-200 dark:border-reply-border-dark rounded-2xl focus:ring-4 focus:ring-cyan-500/10 focus:border-cyan-500 transition-all outline-none font-semibold text-gray-900 dark:text-white placeholder-gray-400"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                Email
              </label>
              <input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="cliente@ejemplo.com"
                className="w-full px-4 py-3.5 bg-reply-bg dark:bg-gray-800/50 border border-gray-200 dark:border-reply-border-dark rounded-2xl focus:ring-4 focus:ring-cyan-500/10 focus:border-cyan-500 transition-all outline-none font-semibold text-gray-900 dark:text-white placeholder-gray-400 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                {t("common.phone")}
              </label>
              <input
                type="tel"
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                placeholder="+57 300 123 4567"
                className="w-full px-4 py-3.5 bg-reply-bg dark:bg-gray-800/50 border border-gray-200 dark:border-reply-border-dark rounded-2xl focus:ring-4 focus:ring-cyan-500/10 focus:border-cyan-500 transition-all outline-none font-semibold text-gray-900 dark:text-white placeholder-gray-400 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
              {t("navigation.tags")}
            </label>
            <div className="space-y-3 bg-reply-bg dark:bg-gray-800/30 p-4 rounded-2xl border border-gray-100 dark:border-reply-border-dark">
              {/* SELECTED TAGS */}
              <div className="flex flex-wrap gap-2 min-h-[32px]">
                {selectedTagIds.map((id) => {
                  const tag = allTags.find((t) => t.id === id);
                  return tag ? (
                    <span
                      key={id}
                      className={`pl-3 pr-2 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 border shadow-sm ${tag.color ? tag.color + " border-transparent" : "bg-white text-gray-800 border-gray-200"}`}
                    >
                      <span className="truncate">{tag.name}</span>
                      <button
                        type="button"
                        onClick={() =>
                          setSelectedTagIds((prev) => prev.filter((tId) => tId !== id))
                        }
                        className="p-0.5 rounded-full hover:bg-black/5 dark:hover:bg-white/10 text-gray-400 hover:text-gray-600 transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </span>
                  ) : null;
                })}
                {selectedTagIds.length === 0 && (
                  <span className="text-gray-400 text-xs italic py-1 pl-1">
                    {t("contacts.form.no_tags", "Ninguna etiqueta seleccionada")}
                  </span>
                )}
              </div>

              {/* AVAILABLE TAGS */}
              <div className="border-t border-gray-100 dark:border-reply-border-dark pt-3">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                    {t("common.available", "Disponibles")}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2 max-h-24 overflow-y-auto custom-scrollbar">
                  {allTags
                    .filter((t) => !selectedTagIds.includes(t.id))
                    .map((tag) => (
                      <button
                        key={tag.id}
                        type="button"
                        onClick={() =>
                          setSelectedTagIds((prev) => [...prev, tag.id])
                        }
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all hover:scale-105 active:scale-95 ${tag.color ? "bg-white dark:bg-reply-panel-dark " + tag.color.replace("text-", "border-").replace("bg-", "text-") : "border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400"}`}
                      >
                        + {tag.name}
                      </button>
                    ))}
                  {allTags.filter((t) => !selectedTagIds.includes(t.id))
                    .length === 0 && (
                    <span className="text-gray-400 text-xs italic">
                      {t("contacts.form.no_more_tags", "No hay más etiquetas disponibles")}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
              {t("contacts.form.internal_notes", "Notas Internas")}
            </label>
            <textarea
              rows={3}
              value={newNotes}
              onChange={(e) => setNewNotes(e.target.value)}
              placeholder="Información relevante, preferencias, historial..."
              className="w-full px-4 py-3.5 bg-reply-bg dark:bg-gray-800/50 border border-gray-200 dark:border-reply-border-dark rounded-2xl focus:ring-4 focus:ring-cyan-500/10 focus:border-cyan-500 transition-all outline-none font-medium text-gray-900 dark:text-white placeholder-gray-400 resize-none text-sm"
            />
          </div>
        </div>
      </form>
    </Modal>
  );
};
