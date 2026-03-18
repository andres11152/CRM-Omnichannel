import React, { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { quickRepliesService } from "@/services/quickRepliesService";
import { QuickReply, CreateQuickReplyDTO } from "@/types";
import {
  Search,
  Plus,
  X,
  MessageSquare,
  ChevronLeft,
  Trash2,
  Edit2,
  Tag,
  Zap,
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

  // Delete Confirmation State - Enterprise: Uses inline confirmation for better UX
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchReplies();
    // Auto-focus search on mount
    setTimeout(() => inputRef.current?.focus(), 150);
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
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Error al guardar");
    }
  };

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
    setDeleteId(null);
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
    // 🛡️ ENTERPRISE UX FIX:
    // 1. "bottom-full mb-4" -> Positions ABOVE the trigger button
    // 2. "right-0" -> Aligns to the right edge
    // 3. "origin-bottom-right" -> Animation flows from the button
    // 4. "max-h-[600px]" + flex column -> Handles content overflow properly
    // 5. "z-[9999]" -> Ensures it stays on top of sticky headers/navbars
    <div className="absolute bottom-full right-0 mb-3 w-[calc(100vw-24px)] xs:w-[350px] sm:w-[400px] bg-white dark:bg-reply-panel-dark rounded-2xl shadow-2xl border border-gray-100 dark:border-reply-border-dark flex flex-col max-h-[65vh] xs:max-h-[500px] sm:max-h-[600px] overflow-hidden origin-bottom-right animate-in fade-in zoom-in-95 duration-200 z-[9999]">
      {/* 1. Header (Sticky) */}
      <div className="px-4 py-3 sm:px-5 sm:py-4 border-b border-gray-100 dark:border-reply-border-dark flex justify-between items-center bg-white dark:bg-reply-panel-dark shrink-0 z-[20]">
        <div className="flex items-center gap-3">
          {view !== "LIST" ? (
            <button
              onClick={resetForm}
              className="p-1.5 -ml-2 text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
          ) : (
            <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
              <Zap className="w-4 h-4 text-indigo-600 dark:text-indigo-400 fill-current" />
            </div>
          )}

          <div>
            <h3 className="font-bold text-gray-900 dark:text-white text-base leading-tight">
              {view === "LIST"
                ? "Respuestas Rpidas"
                : view === "CREATE"
                  ? "Nueva Respuesta"
                  : "Editar Respuesta"}
            </h3>
            {view === "LIST" && (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Selecciona para enviar al instante
              </p>
            )}
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {view === "LIST" && (
        <>
          {/* 2. Search & Filter (Sticky) */}
          <div className="p-2 sm:p-3 bg-white dark:bg-reply-panel-dark space-y-2 sm:space-y-3 shrink-0 border-b border-gray-50 dark:border-reply-border-dark/50">
            <div className="relative group">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 group-focus-within:text-indigo-500 transition-colors" />
              <input
                ref={inputRef}
                type="text"
                placeholder="Buscar respuestas..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 sm:py-2.5 bg-reply-bg dark:bg-gray-800 border border-transparent focus:border-indigo-500 focus:bg-white dark:focus:bg-reply-surface-dark rounded-xl text-sm text-gray-900 dark:text-white focus:outline-none transition-all placeholder:text-gray-400 shadow-sm"
              />
            </div>

            {/* Categories Pills */}
            {uniqueCategories.length > 0 && (
              <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide mask-fade-right">
                <button
                  onClick={() => setSelectedCategory(null)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all border ${!selectedCategory ? "bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-500/20" : "bg-reply-bg text-gray-600 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-reply-border-dark hover:bg-gray-100 dark:hover:bg-gray-700"}`}
                >
                  Todas
                </button>
                {uniqueCategories.map((cat) => (
                  <button
                    key={cat}
                    onClick={() =>
                      setSelectedCategory(cat === selectedCategory ? null : cat)
                    }
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all border ${cat === selectedCategory ? "bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-500/20" : "bg-reply-bg text-gray-600 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-reply-border-dark hover:bg-gray-100 dark:hover:bg-gray-700"}`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 3. List (Scrollable) */}
          <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar bg-reply-bg/50 dark:bg-reply-bg-dark/50 relative min-h-[200px]">
            {loading ? (
              <div className="flex flex-col items-center justify-center h-48 gap-3">
                <div className="w-8 h-8 border-3 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                <span className="text-xs text-gray-500 font-medium">
                  Cargando biblioteca...
                </span>
              </div>
            ) : filteredReplies.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-gray-400 text-center p-6">
                <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mb-4">
                  <MessageSquare className="w-8 h-8 opacity-40 text-gray-500" />
                </div>
                <p className="font-medium text-gray-600 dark:text-gray-300">
                  No hay respuestas
                </p>
                <p className="text-xs mt-1 max-w-[200px] opacity-75">
                  {searchTerm
                    ? "Intenta con otro término de búsqueda."
                    : "Crea tu primera respuesta rpida para agilizar el chat."}
                </p>
              </div>
            ) : (
              filteredReplies.map((reply) => (
                <div
                  key={reply.id}
                  onClick={() => onSelect(reply.content)}
                  className="group relative p-3 sm:p-3.5 bg-white dark:bg-reply-panel-dark hover:bg-indigo-50 dark:hover:bg-indigo-900/10 rounded-xl border border-transparent hover:border-indigo-100 dark:hover:border-indigo-800/50 cursor-pointer transition-all hover:shadow-sm hover:scale-[1.01]"
                >
                  <div className="flex justify-between items-start gap-3 mb-1.5">
                    <span className="font-bold text-sm text-gray-800 dark:text-gray-200 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 flex-1 truncate">
                      {reply.title}
                    </span>

                    {/* Actions Overlay */}
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-white/80 dark:bg-reply-panel-dark/80 backdrop-blur-sm rounded-lg pl-2">
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
                        className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-md transition-colors"
                        title="Editar"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={(e) => handleDeleteClick(reply.id, e)}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-md transition-colors"
                        title="Eliminar"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 leading-relaxed font-normal">
                    {reply.content}
                  </p>

                  {reply.category && (
                    <div className="mt-2.5 flex items-center gap-2">
                      <span className="text-[9px] sm:text-[10px] px-2 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 rounded-md font-bold uppercase tracking-wider">
                        {reply.category}
                      </span>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          {/* 4. Footer Action (Sticky) */}
          <div className="p-3 sm:p-4 border-t border-gray-100 dark:border-reply-border-dark bg-white dark:bg-reply-panel-dark shrink-0">
            <button
              onClick={() => setView("CREATE")}
              className="w-full flex items-center justify-center gap-2 py-2.5 sm:py-3 bg-gray-900 dark:bg-indigo-600 hover:bg-black dark:hover:bg-indigo-700 text-white rounded-xl text-sm font-bold transition-all shadow-lg shadow-gray-200 dark:shadow-none hover:shadow-xl hover:-translate-y-0.5"
            >
              <Plus className="w-4 h-4" />
              Nueva Respuesta
            </button>
          </div>
        </>
      )}

      {/* CREATE / EDIT FORM */}
      {view !== "LIST" && (
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5 bg-white dark:bg-reply-panel-dark">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider ml-1">
              Título
            </label>
            <input
              autoFocus
              className="w-full px-4 py-2.5 bg-reply-bg dark:bg-gray-800 border border-gray-200 dark:border-reply-border-dark rounded-xl text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-medium placeholder:font-normal"
              placeholder="Ej. Saludo Inicial"
              value={formData.title}
              onChange={(e) =>
                setFormData({ ...formData, title: e.target.value })
              }
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider ml-1">
              Contenido del Mensaje
            </label>
            <textarea
              className="w-full px-4 py-3 bg-reply-bg dark:bg-gray-800 border border-gray-200 dark:border-reply-border-dark rounded-xl text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all min-h-[140px] resize-none leading-relaxed placeholder:font-normal"
              placeholder="Escribe el mensaje aquíí..."
              value={formData.content}
              onChange={(e) =>
                setFormData({ ...formData, content: e.target.value })
              }
            />
            <p className="text-[10px] text-gray-400 text-right px-1">
              Puedes usar variables como {"{{nombre}}"} en futuras versiones
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider ml-1">
              Categoría (Opcional)
            </label>
            <div className="relative">
              <Tag className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                className="w-full pl-10 pr-4 py-2.5 bg-reply-bg dark:bg-gray-800 border border-gray-200 dark:border-reply-border-dark rounded-xl text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
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

          <div className="pt-6 flex gap-3">
            <button
              onClick={resetForm}
              className="flex-1 py-3 border border-gray-200 dark:border-reply-border-dark text-gray-700 dark:text-gray-200 rounded-xl text-sm font-bold hover:bg-reply-bg dark:hover:bg-gray-800 transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold transition-all shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/30"
            >
              {view === "CREATE" ? "Crear Respuesta" : "Guardar Cambios"}
            </button>
          </div>
        </div>
      )}

      {/* OVERLAY: Delete Confirmation */}
      {deleteId && (
        <div className="absolute inset-0 bg-white/95 dark:bg-reply-panel-dark/95 backdrop-blur-sm z-50 flex flex-col items-center justify-center p-6 text-center animate-in fade-in duration-200">
          <div className="w-16 h-16 bg-red-50 dark:bg-red-900/10 rounded-full flex items-center justify-center mb-4 border border-red-100 dark:border-red-900/30">
            <Trash2 className="w-8 h-8 text-red-500 dark:text-red-400" />
          </div>
          <h4 className="text-gray-900 dark:text-white font-bold text-lg mb-2">
            ¿Eliminar respuesta?
          </h4>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-8 max-w-[200px] leading-relaxed">
            Esta acción es irreversible y la eliminar de tu lista.
          </p>
          <div className="flex gap-3 w-full">
            <button
              onClick={() => setDeleteId(null)}
              className="flex-1 py-2.5 border border-gray-200 dark:border-reply-border-dark rounded-xl text-sm font-bold text-gray-700 dark:text-gray-300 hover:bg-reply-bg dark:hover:bg-gray-800 transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={confirmDelete}
              className="flex-1 py-2.5 bg-red-500 hover:bg-red-600 text-white rounded-xl text-sm font-bold transition-all shadow-lg shadow-red-500/20"
            >
              Eliminar
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
