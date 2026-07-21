import React from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { MessageTemplate } from "@/types";
import { Plus, Layout, Edit2, Trash2, FileText } from "lucide-react";
import type { NewTemplateState } from "@/hooks/useMarketingDashboard";

interface TemplateGalleryProps {
  templates: MessageTemplate[];
  onSelectTemplate: (id: string) => void;
  onEditTemplate: (template: MessageTemplate, bodyContent: string) => void;
  onDeleteTemplate: (id: string) => void;
  onCreateNew: () => void;
}

export const TemplateGallery: React.FC<TemplateGalleryProps> = ({
  templates,
  onSelectTemplate,
  onEditTemplate,
  onDeleteTemplate,
  onCreateNew,
}) => {
  const { t: translate } = useTranslation();
  return (
  <div className="flex flex-col h-full gap-6 animate-fade-in">
    {/* HEADER */}
    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white/50 dark:bg-gray-800/10 p-6 rounded-[2rem] border border-gray-100 dark:border-reply-border-dark backdrop-blur-md shadow-sm">
      <div>
        <h3 className="text-2xl font-black text-gray-900 dark:text-white tracking-tight flex items-center gap-3">
          <Layout className="w-6 h-6 text-rose-500" /> Plantillas de Diseño
        </h3>
        <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mt-1">
          Gestiona y reutiliza tus mejores comunicaciones
        </p>
      </div>
      <button
        onClick={onCreateNew}
        className="w-full md:w-auto px-8 py-4 bg-gray-900 dark:bg-white text-white dark:text-black rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl transition-all hover:scale-105 active:scale-95 flex items-center justify-center gap-3"
      >
        <Plus className="w-4 h-4" /> Nueva Plantilla
      </button>
    </div>

    {/* GRID */}
    {templates.length === 0 ? (
      <div className="flex-1 flex flex-col items-center justify-center text-center p-12 bg-white dark:bg-reply-surface-dark rounded-[3rem] border border-dashed border-gray-200 dark:border-reply-border-dark shadow-inner">
        <div className="w-32 h-32 bg-reply-bg dark:bg-gray-800/50 rounded-full flex items-center justify-center mb-8 animate-pulse">
          <FileText className="w-12 h-12 text-gray-400 dark:text-gray-500" />
        </div>
        <h4 className="text-xl font-black text-gray-900 dark:text-white mb-2">Tu Galería está Vacía</h4>
        <p className="text-sm text-gray-500 max-w-xs uppercase tracking-widest font-bold leading-relaxed">
          Crea tu primer diseño profesional para empezar a impactar
        </p>
      </div>
    ) : (
      <div className="overflow-y-auto flex-1 custom-scrollbar pb-10">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {templates.map((t) => {
            const bodyContent = Array.isArray(t.components)
              ? t.components.find((c) => c.type === "BODY")?.text || ""
              : "";
            const isHtml = /<[a-z][\s\S]*>/i.test(bodyContent);

            return (
              <div
                key={t.id}
                className="group relative bg-white dark:bg-reply-surface-dark border border-gray-100 dark:border-reply-border-dark rounded-[2.5rem] overflow-hidden hover:shadow-2xl hover:shadow-rose-500/10 transition-all duration-500 flex flex-col h-[380px]"
              >
                {/* Preview Area */}
                <div className="h-2/3 bg-reply-bg dark:bg-reply-bg-dark overflow-hidden relative border-b border-gray-50 dark:border-reply-border-dark">
                  {isHtml ? (
                    <div className="w-[300%] h-[300%] transform scale-[0.33] origin-top-left pointer-events-none p-10 bg-white">
                      <div dangerouslySetInnerHTML={{ __html: bodyContent }} />
                    </div>
                  ) : (
                    <div className="p-8 text-[11px] text-gray-400 dark:text-gray-500 whitespace-pre-wrap font-mono leading-relaxed italic">
                      {bodyContent.slice(0, 400)}
                      {bodyContent.length > 400 && "..."}
                    </div>
                  )}

                  {/* Hover Overlay */}
                  <div className="absolute inset-0 bg-gray-900/40 dark:bg-black/60 opacity-0 group-hover:opacity-100 transition-all duration-300 flex flex-col items-center justify-center gap-4 backdrop-blur-[2px]">
                    <button
                      onClick={() => {
                        onSelectTemplate(t.id);
                        toast.success(translate("template_gallery.toast.loaded", "Plantilla cargada"));
                      }}
                      className="px-8 py-3 bg-white text-black rounded-xl font-black text-[10px] uppercase tracking-widest hover:scale-110 transition-transform shadow-xl"
                    >
                      Seleccionar
                    </button>
                    <div className="flex gap-2">
                      <button
                        onClick={() => onEditTemplate(t, bodyContent)}
                        className="p-3 bg-white/20 hover:bg-white/40 text-white rounded-xl backdrop-blur-md transition-all"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => onDeleteTemplate(t.id)}
                        className="p-3 bg-rose-500/80 hover:bg-rose-600 text-white rounded-xl backdrop-blur-md transition-all shadow-lg"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Footer */}
                <div className="p-6 flex-1 flex flex-col justify-between">
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-[9px] font-black text-rose-500 uppercase tracking-[0.2em] bg-rose-50 dark:bg-rose-500/10 px-2 py-0.5 rounded">
                        {t.category}
                      </span>
                      <span className="text-[10px] text-gray-400 font-bold">
                        {isHtml ? "DESIGN" : "TEXT"}
                      </span>
                    </div>
                    <h4 className="font-black text-gray-900 dark:text-white truncate text-sm">{t.name}</h4>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    )}
  </div>
  );
};
