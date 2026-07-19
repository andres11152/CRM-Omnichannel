import React, { useState, useEffect, useMemo } from "react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import {
  Tag as TagIcon,
  Plus,
  Pencil,
  Trash2,
  Search,
  Check,
  ArrowRight,
  X,
  ShieldAlert,
} from "lucide-react";
import { Tag } from "@/types";
import { api } from "@/lib/axios";
import { ModuleHeader } from "./common/ModuleHeader";
import { useAuthStore } from "@/stores/authStore";
import { useModal } from "@/context/ModalContext";
import { getModuleCache, setModuleCache } from "@/lib/moduleCache";

const ADMIN_ROLES = ["ADMIN", "SUPERVISOR", "MASTER"];
const NAME_MAX_LENGTH = 40;
const TAGS_CACHE_KEY = "tags:list";

export const TagsManager: React.FC = () => {
  const { t, i18n } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const canManageTags = user?.role ? ADMIN_ROLES.includes(user.role) : false;
  const { confirm } = useModal();
  // Stale-while-revalidate: instant render on module re-entry, silent refetch
  const cachedTags = getModuleCache<Tag[]>(TAGS_CACHE_KEY);
  const [tags, setTags] = useState<Tag[]>(cachedTags ?? []);
  const [loading, setLoading] = useState(!cachedTags);
  const [saving, setSaving] = useState(false);
  const [newTag, setNewTag] = useState({
    name: "",
    color: "bg-indigo-500 text-white",
  });
  const [editingTag, setEditingTag] = useState<Tag | null>(null);
  const [search, setSearch] = useState("");

  const dateLocale = i18n.language?.startsWith("en") ? "en-US" : "es-ES";

  // Expanded Professional Color Palette (labels translated for tooltips)
  const colors = [
    { label: t("tags_mgmt.color_indigo", "Índigo"), value: "bg-indigo-500 text-white" },
    { label: t("tags_mgmt.color_blue", "Azul"), value: "bg-blue-500 text-white" },
    { label: t("tags_mgmt.color_sky", "Cielo"), value: "bg-sky-500 text-white" },
    { label: t("tags_mgmt.color_teal", "Verde azulado"), value: "bg-teal-500 text-white" },
    { label: t("tags_mgmt.color_emerald", "Esmeralda"), value: "bg-emerald-500 text-white" },
    { label: t("tags_mgmt.color_green", "Verde"), value: "bg-green-500 text-white" },
    { label: t("tags_mgmt.color_yellow", "Amarillo"), value: "bg-yellow-500 text-white" },
    { label: t("tags_mgmt.color_orange", "Naranja"), value: "bg-orange-500 text-white" },
    { label: t("tags_mgmt.color_red", "Rojo"), value: "bg-red-500 text-white" },
    { label: t("tags_mgmt.color_rose", "Rosado"), value: "bg-rose-500 text-white" },
    { label: t("tags_mgmt.color_pink", "Rosa"), value: "bg-pink-500 text-white" },
    { label: t("tags_mgmt.color_purple", "Púrpura"), value: "bg-purple-500 text-white" },
    { label: t("tags_mgmt.color_violet", "Violeta"), value: "bg-violet-500 text-white" },
    { label: t("tags_mgmt.color_gray", "Gris"), value: "bg-gray-500 text-white" },
  ];

  const filteredTags = useMemo(
    () => tags.filter((tg) => tg.name.toLowerCase().includes(search.toLowerCase())),
    [search, tags],
  );

  const formName = editingTag ? editingTag.name : newTag.name;
  const formColor = editingTag ? editingTag.color : newTag.color;

  useEffect(() => {
    fetchTags();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchTags = async () => {
    try {
      if (!getModuleCache<Tag[]>(TAGS_CACHE_KEY)) {
        setLoading(true);
      }
      const res = await api.get("/tags");
      // Handle both direct array or wrapped response
      const tagsData = Array.isArray(res.data) ? res.data : res.data.data || [];
      setTags(tagsData);
      setModuleCache<Tag[]>(TAGS_CACHE_KEY, tagsData);
    } catch (err) {
      console.error(err);
      toast.error(t("tags_mgmt.toast_loaded_error", "Error al cargar etiquetas"));
    } finally {
      setLoading(false);
    }
  };

  const setFormName = (name: string) => {
    if (editingTag) setEditingTag({ ...editingTag, name });
    else setNewTag((prev) => ({ ...prev, name }));
  };

  const setFormColor = (color: string) => {
    if (editingTag) setEditingTag({ ...editingTag, color });
    else setNewTag((prev) => ({ ...prev, color }));
  };

  const handleCreateTag = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTag.name.trim()) return;

    if (tags.some((tg) => tg.name.toLowerCase() === newTag.name.trim().toLowerCase())) {
      toast.error(t("tags_mgmt.toast_duplicate", "Ya existe una etiqueta con este nombre"));
      return;
    }

    try {
      setSaving(true);
      const res = await api.post("/tags", { ...newTag, name: newTag.name.trim() });
      const createdTag = res.data.data || res.data; // Flexible unwrapping

      setTags((prev) => [...prev, createdTag]);
      setNewTag((prev) => ({ ...prev, name: "" }));
      toast.success(t("tags_mgmt.toast_created", "Etiqueta creada correctamente"));
    } catch (err) {
      console.error(err);
      toast.error(t("tags_mgmt.toast_create_error", "Error al crear etiqueta"));
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateTag = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTag || !editingTag.name.trim()) return;

    if (tags.some((tg) => tg.id !== editingTag.id && tg.name.toLowerCase() === editingTag.name.trim().toLowerCase())) {
      toast.error(t("tags_mgmt.toast_duplicate", "Ya existe una etiqueta con este nombre"));
      return;
    }

    try {
      setSaving(true);
      const res = await api.patch(`/tags/${editingTag.id}`, {
        name: editingTag.name.trim(),
        color: editingTag.color,
      });
      const updatedTag = res.data.data || res.data;

      setTags((prev) => prev.map((tg) => (tg.id === editingTag.id ? updatedTag : tg)));
      setEditingTag(null);
      toast.success(t("tags_mgmt.toast_updated", "Etiqueta actualizada correctamente"));
    } catch (err) {
      console.error(err);
      toast.error(t("tags_mgmt.toast_update_error", "Error al actualizar etiqueta"));
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteTag = async (id: string, name: string) => {
    const ok = await confirm({
      title: t("tags_mgmt.confirm_delete_title", "¿Eliminar etiqueta?"),
      message: t("tags_mgmt.confirm_delete_message", `La etiqueta "{{name}}" será eliminada permanentemente y removida de todas las conversaciones.`, { name }),
      confirmText: t("tags_mgmt.confirm_delete_cta", "Eliminar"),
      cancelText: t("tags_mgmt.cancel", "Cancelar"),
      variant: "danger",
    });
    if (!ok) return;

    try {
      await api.delete(`/tags/${id}`);
      setTags((prev) => prev.filter((tg) => tg.id !== id));
      if (editingTag?.id === id) setEditingTag(null);
      toast.success(t("tags_mgmt.toast_deleted", "Etiqueta eliminada"));
    } catch (err) {
      console.error(err);
      toast.error(t("tags_mgmt.toast_delete_error", "Error al eliminar etiqueta"));
    }
  };

  return (
    <div className="h-full flex flex-col bg-reply-bg dark:bg-reply-bg-dark overflow-hidden font-sans">
      <ModuleHeader
        title={t("tags_mgmt.title", "Gestión de Etiquetas")}
        description={t("tags_mgmt.description", "Clasifica y organiza tus conversaciones con un sistema visual inteligente.")}
        icon={<TagIcon className="w-6 h-6 md:w-8 md:h-8 text-white" />}
        gradient="from-pink-600 to-rose-600 dark:from-[#2e1015] dark:to-[#1a0b0d]"
        stats={{ label: t("tags_mgmt.total_tags", "Total Etiquetas"), value: tags.length }}
      />

      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <div className="max-w-6xl mx-auto p-4 md:p-8 space-y-8">
          {/* READ-ONLY NOTICE (agents without management permission) */}
          {!canManageTags && (
            <div className="flex items-center gap-3 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-2xl px-5 py-3.5">
              <ShieldAlert className="w-5 h-5 text-amber-500 flex-shrink-0" />
              <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                {t("tags_mgmt.readonly_notice", "Solo administradores y supervisores pueden gestionar etiquetas.")}
              </p>
            </div>
          )}

          {/* MAIN CONTENT GRID */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* CREATION SIDEBAR (LG) / TOP CARD (SM) — ADMIN+ ONLY */}
            {canManageTags && (
              <div className="lg:col-span-4 space-y-6 lg:sticky lg:top-4">
                <div className="bg-white dark:bg-reply-surface-dark rounded-3xl shadow-xl shadow-gray-200/50 dark:shadow-none border border-gray-100 dark:border-reply-border-dark p-6 md:p-8 overflow-hidden relative">
                  {/* Decorative corner */}
                  <div className="absolute -top-12 -right-12 w-24 h-24 bg-indigo-500/5 rounded-full blur-2xl" />

                  <div className="relative z-10 space-y-7">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-2xl bg-indigo-50 dark:bg-indigo-500/10 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                        {editingTag ? <Pencil className="w-5 h-5" /> : <Plus className="w-6 h-6" />}
                      </div>
                      <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                        {editingTag
                          ? t("tags_mgmt.edit_tag", "Editar Etiqueta")
                          : t("tags_mgmt.create_tag", "Crear Etiqueta")}
                      </h2>
                    </div>

                    {/* EDITING BANNER */}
                    {editingTag && (
                      <div className="flex items-center justify-between bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 rounded-xl px-4 py-2.5 animate-in fade-in slide-in-from-top-1">
                        <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400 truncate pr-2">
                          {t("tags_mgmt.editing_notice", `Editando "{{name}}"`, { name: editingTag.name })}
                        </span>
                        <button
                          type="button"
                          onClick={() => setEditingTag(null)}
                          className="p-1 text-emerald-600 hover:bg-emerald-100 dark:hover:bg-emerald-500/20 rounded-full transition-colors flex-shrink-0"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}

                    <form onSubmit={editingTag ? handleUpdateTag : handleCreateTag} className="space-y-7">
                      <div className="space-y-2.5">
                        <div className="flex items-center justify-between px-1">
                          <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                            {t("tags_mgmt.name", "Nombre")}
                          </label>
                          <span className={`text-[10px] font-bold tabular-nums ${formName.length >= NAME_MAX_LENGTH ? "text-red-500" : "text-gray-300 dark:text-gray-600"}`}>
                            {formName.length}/{NAME_MAX_LENGTH}
                          </span>
                        </div>
                        <input
                          type="text"
                          value={formName}
                          maxLength={NAME_MAX_LENGTH}
                          onChange={(e) => setFormName(e.target.value)}
                          placeholder={t("tags_mgmt.name_placeholder", "Ej: Cliente VIP, Urgente, Facturación...")}
                          className="w-full px-5 py-4 bg-reply-bg dark:bg-gray-800/50 border border-gray-200 dark:border-reply-border-dark rounded-2xl text-gray-800 dark:text-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 outline-none transition-all font-semibold"
                        />
                      </div>

                      <div className="space-y-3">
                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-1">
                          {t("tags_mgmt.visual_identity", "Identidad Visual")}
                        </label>
                        <div className="grid grid-cols-7 gap-2.5">
                          {colors.map((c) => {
                            const isSelected = formColor === c.value;
                            return (
                              <button
                                key={c.value}
                                type="button"
                                title={c.label}
                                onClick={() => setFormColor(c.value)}
                                className={`aspect-square rounded-xl cursor-pointer transition-all duration-300 flex items-center justify-center shadow-sm relative group ${c.value} ${isSelected ? "ring-2 ring-offset-2 ring-indigo-500 dark:ring-offset-[#111b21] scale-105 z-10" : "hover:scale-110 opacity-60 hover:opacity-100"}`}
                              >
                                {isSelected && <Check className="w-4 h-4 drop-shadow-sm" strokeWidth={3} />}
                                <div className="absolute inset-0 rounded-xl bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity" />
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* LIVE PREVIEW */}
                      <div className="space-y-2.5">
                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-1">
                          {t("tags_mgmt.live_preview", "Vista Previa")}
                        </label>
                        <div className="flex items-center justify-center bg-reply-bg dark:bg-gray-800/50 border border-dashed border-gray-200 dark:border-reply-border-dark rounded-2xl py-5 px-4">
                          <span className={`inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-bold shadow-sm max-w-full ${formColor}`}>
                            <TagIcon className="w-3.5 h-3.5 opacity-70 flex-shrink-0" />
                            <span className="truncate">
                              {formName.trim() || t("tags_mgmt.preview_fallback", "Tu etiqueta")}
                            </span>
                          </span>
                        </div>
                      </div>

                      <div className="flex gap-3">
                        {editingTag && (
                          <button
                            type="button"
                            onClick={() => setEditingTag(null)}
                            className="w-1/3 py-4 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-800 dark:text-white font-black rounded-2xl transition-all transform active:scale-[0.98] text-center"
                          >
                            {t("tags_mgmt.cancel", "Cancelar")}
                          </button>
                        )}
                        <button
                          type="submit"
                          disabled={saving || !formName.trim()}
                          className={`py-4 font-black rounded-2xl shadow-xl transition-all transform active:scale-[0.98] flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed ${
                            editingTag
                              ? "w-2/3 bg-emerald-600 hover:bg-emerald-700 shadow-emerald-500/20 text-white"
                              : "w-full bg-indigo-600 hover:bg-indigo-700 shadow-indigo-500/20 text-white"
                          }`}
                        >
                          {editingTag
                            ? t("tags_mgmt.update_tag", "Actualizar")
                            : t("tags_mgmt.save_tag", "Guardar Etiqueta")}
                          {editingTag ? <Check className="w-5 h-5" /> : <ArrowRight className="w-5 h-5" />}
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
                <div className="flex items-center gap-3">
                  <h3 className="text-2xl font-black text-gray-900 dark:text-white tracking-tight">
                    {t("tags_mgmt.all_tags", "Todas tus etiquetas")}
                  </h3>
                  {!loading && (
                    <span className="px-2.5 py-1 rounded-full bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 text-xs font-bold border border-indigo-100 dark:border-indigo-500/20 tabular-nums">
                      {search
                        ? t("tags_mgmt.results_count", "{{count}} de {{total}}", { count: filteredTags.length, total: tags.length })
                        : tags.length}
                    </span>
                  )}
                </div>
                <div className="relative group min-w-[300px]">
                  <input
                    type="text"
                    placeholder={t("tags_mgmt.search_placeholder", "Buscar etiquetas...")}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full pl-12 pr-10 py-3.5 bg-white dark:bg-reply-surface-dark rounded-2xl border border-gray-100 dark:border-reply-border-dark shadow-sm focus:shadow-xl focus:border-indigo-500 transition-all outline-none font-medium text-gray-800 dark:text-white"
                  />
                  <Search className="w-5 h-5 text-gray-400 group-focus-within:text-indigo-500 absolute left-4 top-1/2 -translate-y-1/2 transition-colors" />
                  {search && (
                    <button
                      onClick={() => setSearch("")}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-full hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
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
                    {search ? (
                      <Search className="w-10 h-10 text-gray-300" strokeWidth={1.5} />
                    ) : (
                      <TagIcon className="w-10 h-10 text-gray-300" strokeWidth={1.5} />
                    )}
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                    {search
                      ? t("tags_mgmt.no_matches_title", "Sin coincidencias")
                      : t("tags_mgmt.empty_title", "Aún no hay etiquetas")}
                  </h3>
                  <p className="text-gray-500 dark:text-gray-400 max-w-xs mx-auto text-sm">
                    {search
                      ? t("tags_mgmt.no_matches_hint", "Intenta con otro término de búsqueda")
                      : canManageTags
                        ? t("tags_mgmt.empty_hint", "Crea tu primera etiqueta para empezar a clasificar conversaciones y contactos.")
                        : t("tags_mgmt.empty_hint_readonly", "Un administrador debe crear las etiquetas de tu equipo.")}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {filteredTags.map((tag) => (
                    <div
                      key={tag.id}
                      className={`group bg-white dark:bg-reply-surface-dark p-1.5 rounded-3xl shadow-sm border transition-all duration-500 flex items-center relative overflow-hidden h-28 ${
                        editingTag?.id === tag.id
                          ? "border-emerald-500/60 ring-2 ring-emerald-500/20 shadow-xl"
                          : "border-gray-100 dark:border-reply-border-dark hover:shadow-2xl hover:shadow-indigo-500/10 hover:border-indigo-500/50"
                      }`}
                    >
                      <div
                        className={`w-20 h-full rounded-[1.25rem] flex items-center justify-center ${tag.color} shadow-inner flex-shrink-0 transition-transform group-hover:scale-95 duration-500`}
                      >
                        <TagIcon className="w-7 h-7 opacity-40" />
                      </div>

                      <div className="flex-1 px-5 flex justify-between items-center min-w-0">
                        <div className="truncate pr-4">
                          <h4 className="font-black text-gray-900 dark:text-white text-lg truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                            {tag.name}
                          </h4>
                          <div className="flex items-center gap-3 mt-1.5">
                            {/* Enterprise Usage Metric */}
                            <div
                              className={`flex items-center gap-1.5 px-2 py-0.5 rounded-md ${tag.count && tag.count > 0 ? "bg-indigo-50 dark:bg-indigo-900/30" : "bg-gray-50 dark:bg-gray-800/50"} border border-gray-100 dark:border-gray-700`}
                            >
                              {tag.count && tag.count > 0 ? (
                                <>
                                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse"></span>
                                  <span className="text-[10px] font-bold text-indigo-700 dark:text-indigo-400">
                                    {t("tags_mgmt.in_use", "{{count}} en uso", { count: tag.count })}
                                  </span>
                                </>
                              ) : (
                                <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400">
                                  {t("tags_mgmt.unused", "Sin uso")}
                                </span>
                              )}
                            </div>

                            <div className="w-1 h-1 rounded-full bg-gray-300 dark:bg-gray-700" />
                            <span
                              className="text-[9px] font-bold text-gray-400 uppercase tracking-widest"
                              title={t("tags_mgmt.created_on", "Fecha de creación")}
                            >
                              {new Date(tag.createdAt || Date.now()).toLocaleDateString(dateLocale, {
                                month: "short",
                                day: "numeric",
                              })}
                            </span>
                          </div>
                        </div>

                        {canManageTags && (
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <button
                              onClick={() => setEditingTag(tag)}
                              className="p-2.5 text-gray-300 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 rounded-2xl transition-all duration-300 transform hover:scale-110 active:scale-95"
                              title={t("tags_mgmt.edit_tooltip", "Editar etiqueta")}
                            >
                              <Pencil className="w-5 h-5" />
                            </button>
                            <button
                              onClick={() => handleDeleteTag(tag.id, tag.name)}
                              className="p-2.5 text-gray-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-2xl transition-all duration-300 transform hover:scale-110 active:scale-95"
                              title={t("tags_mgmt.delete_tooltip", "Eliminar etiqueta")}
                            >
                              <Trash2 className="w-5 h-5" />
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
