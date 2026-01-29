import React, { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { quickRepliesService } from "../services/quickRepliesService";
import { QuickReply, CreateQuickReplyDTO } from "../types";
import {
  Search,
  Plus,
  X,
  MessageSquare,
  ChevronLeft,
  Trash2,
  Edit2,
  Tag,
} from "lucide-react";

interface Props {
  onSelect: (content: string) => void;
  onClose: () => void;
}

export const QuickReplies: React.FC<Props> = ({ onSelect, onClose }) => {
  const [replies, setReplies] = useState<QuickReply[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"LIST" | "CREATE" | "EDIT">("LIST");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  // Create/Edit State
  const [formData, setFormData] = useState<CreateQuickReplyDTO>({
    title: "",
    content: "",
    category: "",
    tags: [],
  });
  const [editingId, setEditingId] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchReplies();
    // Auto-focus search on mount
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

  const fetchReplies = async () => {
    try {
      setLoading(true);
      const data = await quickRepliesService.getQuickReplies();
      setReplies(data);
    } catch (error) {
      console.error("Failed to load replies:", error);
      toast.error("No se pudieron cargar las respuestas");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!formData.title.trim() || !formData.content.trim()) {
      toast.error("Título y contenido son obligatorios");
      return;
    }

    try {
      if (view === "CREATE") {
        const newReply = await quickRepliesService.createQuickReply(formData);
        setReplies((prev) => [...prev, newReply]);
        toast.success("Respuesta creada");
      } else if (view === "EDIT" && editingId) {
        const updated = await quickRepliesService.updateQuickReply(
          editingId,
          formData,
        );
        setReplies((prev) =>
          prev.map((r) => (r.id === editingId ? updated : r)),
        );
        toast.success("Respuesta actualizada");
      }
      resetForm();
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Error al guardar");
    }
  };

  // Delete Confirmation State
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const handleDeleteClick = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleteId(id);
  };

  const confirmDelete = async () => {
    if (!deleteId) return;
    try {
      await quickRepliesService.deleteQuickReply(deleteId);
      setReplies((prev) => prev.filter((r) => r.id !== deleteId));
      toast.success("Eliminada correctamente");
      setDeleteId(null);
    } catch (error) {
      toast.error("Error al eliminar");
    }
  };

  const resetForm = () => {
    setFormData({ title: "", content: "", category: "", tags: [] });
    setEditingId(null);
    setView("LIST");
  };

  const filteredReplies = replies.filter((r) => {
    const matchesSearch =
      r.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.content.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory
      ? r.category === selectedCategory
      : true;
    return matchesSearch && matchesCategory;
  });

  const uniqueCategories = Array.from(
    new Set(replies.map((r) => r.category).filter(Boolean)),
  ) as string[];

  return (
    <div className="w-96 bg-white dark:bg-[#1e293b] rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 flex flex-col min-h-[300px] max-h-[500px] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
      {/* Header */}
      <div className="p-4 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center bg-gray-50/50 dark:bg-slate-800/50 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          {view !== "LIST" && (
            <button
              onClick={resetForm}
              className="p-1 hover:bg-gray-200 dark:hover:bg-slate-700 rounded-full transition-colors"
            >
              <ChevronLeft className="w-5 h-5 text-gray-600 dark:text-gray-300" />
            </button>
          )}
          <h3 className="font-bold text-gray-800 dark:text-white flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-indigo-500" />
            {view === "LIST"
              ? "Respuestas Rápidas"
              : view === "CREATE"
                ? "Nueva Respuesta"
                : "Editar Respuesta"}
          </h3>
        </div>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {view === "LIST" ? (
        <>
          {/* Search & Filter */}
          <div className="p-3 space-y-3 bg-white dark:bg-[#1e293b]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                ref={inputRef}
                type="text"
                placeholder="Buscar (ej. Saludo, Precio...)"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-gray-100 dark:bg-slate-800 border border-transparent focus:border-indigo-500 rounded-lg text-sm text-gray-800 dark:text-gray-200 focus:outline-none transition-all"
              />
            </div>

            {/* Categories Pills */}
            {uniqueCategories.length > 0 && (
              <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                <button
                  onClick={() => setSelectedCategory(null)}
                  className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors border ${!selectedCategory ? "bg-indigo-100 text-indigo-700 border-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-300 dark:border-indigo-800" : "bg-white text-gray-600 border-gray-200 dark:bg-slate-800 dark:text-gray-400 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-700"}`}
                >
                  Todas
                </button>
                {uniqueCategories.map((cat) => (
                  <button
                    key={cat}
                    onClick={() =>
                      setSelectedCategory(cat === selectedCategory ? null : cat)
                    }
                    className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors border ${cat === selectedCategory ? "bg-indigo-100 text-indigo-700 border-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-300 dark:border-indigo-800" : "bg-white text-gray-600 border-gray-200 dark:bg-slate-800 dark:text-gray-400 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-700"}`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-1 bg-gray-50/30 dark:bg-[#0b141a]/30">
            {loading ? (
              <div className="flex justify-center items-center h-40">
                <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : filteredReplies.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 text-gray-400 text-sm">
                <MessageSquare className="w-8 h-8 mb-2 opacity-20" />
                <p>No se encontraron respuestas.</p>
                {searchTerm && (
                  <p className="text-xs mt-1">Intenta con otro término.</p>
                )}
              </div>
            ) : (
              filteredReplies.map((reply) => (
                <div
                  key={reply.id}
                  onClick={() => onSelect(reply.content)}
                  className="group relative p-3 bg-white dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-900/10 rounded-lg border border-gray-100 dark:border-gray-700 cursor-pointer transition-all hover:shadow-sm"
                >
                  <div className="flex justify-between items-start mb-1">
                    <span className="font-bold text-sm text-gray-800 dark:text-gray-200 group-hover:text-indigo-600 dark:group-hover:text-indigo-400">
                      {reply.title}
                    </span>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setFormData({
                            title: reply.title,
                            content: reply.content,
                            category: reply.category,
                            tags: reply.tags,
                          });
                          setEditingId(reply.id);
                          setView("EDIT");
                        }}
                        className="p-1 text-gray-400 hover:text-indigo-500 rounded"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={(e) => handleDeleteClick(reply.id, e)}
                        className="p-1 text-gray-400 hover:text-red-500 rounded"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 leading-relaxed">
                    {reply.content}
                  </p>
                  {reply.category && (
                    <div className="mt-2 flex gap-1">
                      <span className="text-[10px] px-1.5 py-0.5 bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-gray-400 rounded-md font-medium">
                        {reply.category}
                      </span>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Footer Action */}
          <div className="p-3 border-t border-gray-100 dark:border-gray-700 bg-white dark:bg-[#1e293b]">
            <button
              onClick={() => setView("CREATE")}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-gray-900 dark:bg-indigo-600 hover:bg-gray-800 dark:hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors shadow-sm"
            >
              <Plus className="w-4 h-4" />
              Nueva Respuesta
            </button>
          </div>
        </>
      ) : (
        /* Create/Edit View */
        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50/50 dark:bg-[#0b141a]/30">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
              Título
            </label>
            <input
              autoFocus
              className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
              placeholder="Ej. Saludo Inicial"
              value={formData.title}
              onChange={(e) =>
                setFormData({ ...formData, title: e.target.value })
              }
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
              Contenido
            </label>
            <textarea
              className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all min-h-[120px] resize-none leading-relaxed"
              placeholder="Hola, ¿en qué podemos ayudarte hoy?..."
              value={formData.content}
              onChange={(e) =>
                setFormData({ ...formData, content: e.target.value })
              }
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
              Categoría (Opcional)
            </label>
            <div className="relative">
              <Tag className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                className="w-full pl-9 pr-3 py-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                placeholder="Ej. Ventas, Soporte"
                value={formData.category}
                onChange={(e) =>
                  setFormData({ ...formData, category: e.target.value })
                }
                list="category-suggestions"
              />
              <datalist id="category-suggestions">
                {uniqueCategories.map((cat) => (
                  <option key={cat} value={cat} />
                ))}
              </datalist>
            </div>
          </div>

          <div className="pt-4 flex gap-3">
            <button
              onClick={resetForm}
              className="flex-1 py-2.5 border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors shadow-sm"
            >
              {view === "CREATE" ? "Crear" : "Guardar Cambios"}
            </button>
          </div>
        </div>
      )}
      {/* Custom Delete Confirmation Overlay */}
      {deleteId && (
        <div className="absolute inset-0 bg-white/95 dark:bg-[#1e293b]/95 backdrop-blur-sm z-50 flex flex-col items-center justify-center p-6 text-center animate-in fade-in duration-200">
          <div className="w-12 h-12 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mb-3">
            <Trash2 className="w-6 h-6 text-red-600 dark:text-red-400" />
          </div>
          <h4 className="text-gray-900 dark:text-white font-bold mb-1">
            ¿Eliminar respuesta?
          </h4>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            Esta acción no se puede deshacer.
          </p>
          <div className="flex gap-2 w-full">
            <button
              onClick={() => setDeleteId(null)}
              className="flex-1 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={confirmDelete}
              className="flex-1 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors shadow-sm"
            >
              Eliminar
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
