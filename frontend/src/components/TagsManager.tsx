import React, { useState, useEffect } from "react";
import { toast } from "sonner";
import { Tag } from "@/types";
import { api } from "@/lib/axios";
import { ModuleHeader } from "./common/ModuleHeader";
import { useAuthStore } from "@/stores/authStore";
import { useModal } from "@/context/ModalContext";

const ADMIN_ROLES = ["ADMIN", "SUPERVISOR", "MASTER"];

export const TagsManager: React.FC = () => {
  const user = useAuthStore((s) => s.user);
  const canManageTags = user?.role ? ADMIN_ROLES.includes(user.role) : false;
  const { confirm } = useModal();
  const [tags, setTags] = useState<Tag[]>([]);
  const [filteredTags, setFilteredTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTag, setNewTag] = useState({
    name: "",
    color: "bg-indigo-500 text-white",
  });
  const [editingTag, setEditingTag] = useState<Tag | null>(null);
  const [search, setSearch] = useState("");

  // Expanded Professional Color Palette
  const colors = [
    { label: "Indigo", value: "bg-indigo-500 text-white" },
    { label: "Blue", value: "bg-blue-500 text-white" },
    { label: "Sky", value: "bg-sky-500 text-white" },
    { label: "Teal", value: "bg-teal-500 text-white" },
    { label: "Emerald", value: "bg-emerald-500 text-white" },
    { label: "Green", value: "bg-green-500 text-white" },
    { label: "Yellow", value: "bg-yellow-500 text-white" }, // Adjusted for contrast
    { label: "Orange", value: "bg-orange-500 text-white" },
    { label: "Red", value: "bg-red-500 text-white" },
    { label: "Rose", value: "bg-rose-500 text-white" },
    { label: "Pink", value: "bg-pink-500 text-white" },
    { label: "Purple", value: "bg-purple-500 text-white" },
    { label: "Violet", value: "bg-violet-500 text-white" },
    { label: "Gray", value: "bg-gray-500 text-white" },
  ];

  useEffect(() => {
    fetchTags();
  }, []);

  useEffect(() => {
    setFilteredTags(
      tags.filter((t) => t.name.toLowerCase().includes(search.toLowerCase())),
    );
  }, [search, tags]);

  const fetchTags = async () => {
    try {
      setLoading(true);
      const res = await api.get("/tags");
      // Handle both direct array or wrapped response
      const tagsData = Array.isArray(res.data) ? res.data : res.data.data || [];
      setTags(tagsData);
    } catch (err) {
      console.error(err);
      toast.error("Error al cargar etiquetas");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateTag = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTag.name.trim()) return;

    if (tags.some((t) => t.name.toLowerCase() === newTag.name.toLowerCase())) {
      toast.error("Ya existe una etiqueta con este nombre");
      return;
    }

    try {
      const res = await api.post("/tags", newTag);
      const createdTag = res.data.data || res.data; // Flexible unwrapping

      setTags((prev) => [...prev, createdTag]);
      setNewTag({ ...newTag, name: "" });
      toast.success("Etiqueta creada correctamente");
    } catch (err) {
      console.error(err);
      toast.error("Error al crear etiqueta");
    }
  };

  const handleUpdateTag = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTag || !editingTag.name.trim()) return;

    if (tags.some((t) => t.id !== editingTag.id && t.name.toLowerCase() === editingTag.name.toLowerCase())) {
      toast.error("Ya existe otra etiqueta con este nombre");
      return;
    }

    try {
      const res = await api.patch(`/tags/${editingTag.id}`, {
        name: editingTag.name,
        color: editingTag.color,
      });
      const updatedTag = res.data.data || res.data;

      setTags((prev) => prev.map((t) => (t.id === editingTag.id ? updatedTag : t)));
      setEditingTag(null);
      toast.success("Etiqueta actualizada correctamente");
    } catch (err) {
      console.error(err);
      toast.error("Error al actualizar etiqueta");
    }
  };

  const handleDeleteTag = async (id: string, name: string) => {
    const ok = await confirm({
      title: `¿Eliminar etiqueta?`,
      message: `La etiqueta "${name}" será eliminada permanentemente.`,
      confirmText: "Eliminar",
      cancelText: "Cancelar",
      variant: "danger",
    });
    if (!ok) return;

    try {
      await api.delete(`/tags/${id}`);
      setTags((prev) => prev.filter((t) => t.id !== id));
      toast.success("Etiqueta eliminada");
    } catch (err) {
      console.error(err);
      toast.error("Error al eliminar etiqueta");
    }
  };

  return (
    <div className="h-full flex flex-col bg-reply-bg dark:bg-reply-bg-dark overflow-hidden font-sans">
      <ModuleHeader
        title="Gestión de Etiquetas"
        description="Clasifica y organiza tus conversaciones con un sistema visual inteligente."
        icon={
          <svg
            className="w-6 h-6 md:w-8 md:h-8 text-white"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"
            />
          </svg>
        }
        gradient="from-pink-600 to-rose-600 dark:from-[#2e1015] dark:to-[#1a0b0d]"
        stats={{ label: "Total Etiquetas", value: tags.length }}
      />

      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <div className="max-w-6xl mx-auto p-4 md:p-8 space-y-8 md:space-y-12">
          {/* MAIN CONTENT GRID */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* CREATION SIDEBAR (LG) / TOP CARD (SM) — ADMIN+ ONLY */}
            {canManageTags && (
              <div className="lg:col-span-4 space-y-6 lg:sticky lg:top-0">
                <div className="bg-white dark:bg-reply-surface-dark rounded-3xl shadow-xl shadow-gray-200/50 dark:shadow-none border border-gray-100 dark:border-reply-border-dark p-6 md:p-8 overflow-hidden relative">
                  {/* Decorative corner */}
                  <div className="absolute -top-12 -right-12 w-24 h-24 bg-indigo-500/5 rounded-full blur-2xl" />

                  <div className="relative z-10 space-y-8">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-2xl bg-indigo-50 dark:bg-indigo-500/10 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                        {editingTag ? (
                          <svg
                            className="w-6 h-6"
                            fill="none;/"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                            />
                          </svg>
                        ) : (
                          <svg
                            className="w-6 h-6"
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
                      </div>
                      <h2 className="text-xl font-bold text-gray-900 dark:text-white mt-1">
                        {editingTag ? "Editar Etiqueta" : "Crear Etiqueta"}
                      </h2>
                    </div>

                    <form onSubmit={editingTag ? handleUpdateTag : handleCreateTag} className="space-y-8">
                      <div className="space-y-3">
                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-1">
                          Nombre
                        </label>
                        <input
                          type="text"
                          value={editingTag ? editingTag.name : newTag.name}
                          onChange={(e) =>
                            editingTag
                              ? setEditingTag({ ...editingTag, name: e.target.value })
                              : setNewTag({ ...newTag, name: e.target.value })
                          }
                          placeholder="Nombre descriptivo..."
                          className="w-full px-5 py-4 bg-reply-bg dark:bg-gray-800/50 border border-gray-200 dark:border-reply-border-dark rounded-2xl text-gray-800 dark:text-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 outline-none transition-all font-semibold text-lg"
                        />
                      </div>

                      <div className="space-y-4">
                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-1">
                          Identidad Visual
                        </label>
                        <div className="grid grid-cols-5 md:grid-cols-7 lg:grid-cols-5 gap-3">
                          {colors.map((c) => {
                            const isSelected = editingTag ? editingTag.color === c.value : newTag.color === c.value;
                            return (
                              <button
                                key={c.value}
                                type="button"
                                onClick={() =>
                                  editingTag
                                    ? setEditingTag({ ...editingTag, color: c.value })
                                    : setNewTag({ ...newTag, color: c.value })
                                }
                                className={`aspect-square rounded-xl cursor-pointer transition-all duration-300 flex items-center justify-center shadow-sm relative group ${c.value} ${isSelected ? "ring-4 ring-offset-4 ring-indigo-500 dark:ring-offset-[#111b21] scale-105 z-10" : "hover:scale-110 opacity-60 hover:opacity-100"}`}
                              >
                                {isSelected && (
                                  <svg
                                    className="w-5 h-5 drop-shadow-sm"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={3}
                                      d="M5 13l4 4L19 7"
                                    />
                                  </svg>
                                )}
                                <div className="absolute inset-0 rounded-xl bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity" />
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div className="flex gap-3">
                        {editingTag && (
                          <button
                            type="button"
                            onClick={() => setEditingTag(null)}
                            className="w-1/3 py-5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-800 dark:text-white font-black rounded-2xl transition-all transform active:scale-[0.98] text-center"
                          >
                            Cancelar
                          </button>
                        )}
                        <button
                          type="submit"
                          disabled={editingTag ? !editingTag.name.trim() : !newTag.name.trim()}
                          className={`py-5 font-black rounded-2xl shadow-xl transition-all transform active:scale-[0.98] flex items-center justify-center gap-3 text-lg ${
                            editingTag
                              ? "w-2/3 bg-emerald-600 hover:bg-emerald-700 shadow-emerald-500/20 text-white"
                              : "w-full bg-indigo-600 hover:bg-indigo-700 shadow-indigo-500/20 text-white"
                          }`}
                        >
                          {editingTag ? "Actualizar" : "Guardar Etiqueta"}
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
                              d={editingTag ? "M5 13l4 4L19 7" : "M13 7l5 5m0 0l-5 5m5-5H6"}
                            />
                          </svg>
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              </div>
            )}

            {/* LIST AREA */}
            <div
              className={`${canManageTags ? "lg:col-span-8" : "lg:col-span-12"} space-y-6 pb-20`}
            >
              {/* Toolbar */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 sticky top-0 md:static bg-reply-bg/80 dark:bg-reply-bg-dark/80 backdrop-blur-md z-20 py-2">
                <h3 className="text-2xl font-black text-gray-900 dark:text-white tracking-tight">
                  Todas tus etiquetas
                </h3>
                <div className="relative group min-w-[300px]">
                  <input
                    type="text"
                    placeholder="Filtro rpido..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full pl-12 pr-6 py-3.5 bg-white dark:bg-reply-surface-dark rounded-2xl border border-gray-100 dark:border-reply-border-dark shadow-sm focus:shado-xl focus:border-indigo-500 transition-all outline-none font-medium"
                  />
                  <svg
                    className="w-5 h-5 text-gray-400 group-focus-within:text-indigo-500 absolute left-4 top-1/2 -translate-y-1/2 transition-colors"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                    />
                  </svg>
                </div>
              </div>

              {/* Grid */}
              {loading ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {[1, 2, 3, 4, 5, 6].map((i) => (
                    <div
                      key={i}
                      className="h-28 bg-white dark:bg-reply-surface-dark rounded-3xl border border-gray-100 dark:border-reply-border-dark animate-pulse"
                    ></div>
                  ))}
                </div>
              ) : filteredTags.length === 0 ? (
                <div className="text-center py-20 bg-white dark:bg-reply-surface-dark rounded-[2.5rem] border border-dashed border-gray-200 dark:border-reply-border-dark">
                  <div className="w-24 h-24 bg-reply-bg dark:bg-gray-800/50 rounded-full flex items-center justify-center mx-auto mb-6">
                    <svg
                      className="w-10 h-10 text-gray-300"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"
                      />
                    </svg>
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                    {search ? "Sin coincidencias" : "No hay etiquetas"}
                  </h3>
                  <p className="text-gray-500 dark:text-gray-400 max-w-xs mx-auto text-sm">
                    {search
                      ? "Intenta con otro término de búsqueda"
                      : "Comienza creando tu primera etiqueta en el panel lateral."}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {filteredTags.map((tag) => (
                    <div
                      key={tag.id}
                      className="group bg-white dark:bg-reply-surface-dark p-1.5 rounded-3xl shadow-sm border border-gray-100 dark:border-reply-border-dark hover:shadow-2xl hover:shadow-indigo-500/10 hover:border-indigo-500/50 transition-all duration-500 flex items-center relative overflow-hidden h-28"
                    >
                      <div
                        className={`w-20 h-full rounded-[1.25rem] flex items-center justify-center ${tag.color} shadow-inner flex-shrink-0 transition-transform group-hover:scale-95 duration-500`}
                      >
                        <span className="text-2xl font-black opacity-40">
                          #
                        </span>
                      </div>

                      <div className="flex-1 px-6 flex justify-between items-center min-w-0">
                        <div className="truncate pr-4">
                          <h4 className="font-black text-gray-900 dark:text-white text-lg truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                            {tag.name}
                          </h4>
                          <div className="flex items-center gap-3 mt-1.5">
                            {/* Enterprise Usage Metric */}
                            <div 
                              className={`flex items-center gap-1.5 px-2 py-0.5 rounded-md ${tag.count && tag.count > 0 ? 'bg-indigo-50 dark:bg-indigo-900/30' : 'bg-gray-50 dark:bg-gray-800/50'} border border-gray-100 dark:border-gray-700`}
                              title={`${tag.count || 0} conversaciones activas con esta etiqueta`}
                            >
                              {tag.count && tag.count > 0 ? (
                                <>
                                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse"></span>
                                  <span className="text-[10px] font-bold text-indigo-700 dark:text-indigo-400">
                                    {tag.count} activas
                                  </span>
                                </>
                              ) : (
                                <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400">
                                  0 uso
                                </span>
                              )}
                            </div>
                            
                            <div className="w-1 h-1 rounded-full bg-gray-300 dark:bg-gray-700" />
                            <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest" title="Fecha de creación">
                              {new Date(
                                tag.createdAt || Date.now(),
                              ).toLocaleDateString("es-ES", {
                                month: "short",
                                day: "numeric",
                              })}
                            </span>
                          </div>
                        </div>

                        {canManageTags && (
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            <button
                              onClick={() => setEditingTag(tag)}
                              className="p-3 text-gray-300 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 rounded-2xl transition-all duration-300 transform scale-90 hover:scale-110 active:scale-95"
                              title="Editar Etiqueta"
                            >
                              <svg
                                className="w-6 h-6"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
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
                              onClick={() => handleDeleteTag(tag.id, tag.name)}
                              className="p-3 text-gray-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-2xl transition-all duration-300 transform scale-90 hover:scale-110 active:scale-95"
                              title="Eliminar Etiqueta"
                            >
                              <svg
                                className="w-6 h-6"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
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
                        )}
                      </div>

                      {/* Hover Glow */}
                      <div className="absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r from-transparent via-indigo-500/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};



