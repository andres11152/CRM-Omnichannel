import React from "react";
import { toast } from "sonner";
import {
  Megaphone, Layout, History, Plus, Calendar, Zap,
  ChevronRight, Rocket, MessageSquare, Mail,
  Smartphone as SmsIcon, CheckCircle2,
} from "lucide-react";
import { ModuleHeader } from "./common/ModuleHeader";
import { MediaLibrary } from "./MediaLibrary";

// Hook (Single Source of Truth)
import { useMarketingDashboard } from "@/hooks/useMarketingDashboard";

// Sub-components
import { CampaignHistory } from "./marketing/CampaignHistory";
import { TemplateGallery } from "./marketing/TemplateGallery";

/**
 * MarketingDashboard — Thin Orchestrator
 *
 * Architecture: Hook + Sub-components pattern.
 * - useMarketingDashboard(): All state, data fetching, business logic
 * - CampaignHistory: Pure presentational table
 * - TemplateGallery: Pure presentational grid
 * - Builder + TemplateEditor: Inline (deeply coupled to state context)
 */
export const MarketingDashboard: React.FC = () => {
  const ctx = useMarketingDashboard();

  return (
    <div className="h-full flex flex-col bg-reply-bg dark:bg-reply-bg-dark transition-colors duration-200">
      <ModuleHeader
        title="Marketing & Difusión"
        description="Gestión profesional de campañas masivas."
        icon={<Megaphone className="w-8 h-8 text-white" />}
        gradient="from-rose-600 to-red-600 dark:from-rose-800 dark:to-red-800"
        stats={{ label: "Total Campañas", value: ctx.campaigns.length }}
      />

      {/* TAB NAVIGATION */}
      <div className="sticky top-0 z-30 bg-white/80 dark:bg-reply-surface-dark/80 backdrop-blur-xl border-b border-gray-100 dark:border-reply-border-dark px-4 py-3">
        <div className="max-w-md mx-auto flex bg-gray-100/50 dark:bg-gray-800/50 p-1 rounded-2xl border border-gray-200/50 dark:border-reply-border-dark/50">
          {([
            { key: "builder" as const, icon: <Plus className="w-4 h-4" />, label: "Crear" },
            { key: "templates" as const, icon: <Layout className="w-4 h-4" />, label: "Plantillas" },
            { key: "history" as const, icon: <History className="w-4 h-4" />, label: "Historial" },
          ]).map(({ key, icon, label }) => (
            <button
              key={key}
              onClick={() => ctx.setActiveSection(key)}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
                ctx.activeSection === key
                  ? "bg-white dark:bg-reply-panel-dark shadow-lg shadow-gray-200/50 dark:shadow-none text-rose-600 dark:text-rose-400"
                  : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
              }`}
            >
              {icon}
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="p-4 md:p-8 flex-1 overflow-hidden">
        {/* ── BUILDER ── */}
        {ctx.activeSection === "builder" && (
          <div className="flex flex-col lg:flex-row h-full gap-8 overflow-y-auto lg:overflow-hidden lg:pb-10">
            {/* FORM */}
            <div className="flex-1 lg:w-2/3 bg-white dark:bg-reply-surface-dark rounded-[2.5rem] shadow-xl shadow-gray-200/50 dark:shadow-none border border-gray-100 dark:border-reply-border-dark flex flex-col overflow-hidden">
              {/* Steps Header */}
              <div className="flex border-b border-gray-100 dark:border-reply-border-dark bg-reply-bg/50 dark:bg-gray-800/20">
                {[1, 2, 3].map((step) => (
                  <div
                    key={step}
                    className={`flex-1 py-6 text-center text-[10px] font-black uppercase tracking-[0.2em] border-b-2 transition-all ${
                      ctx.builderStep === step
                        ? "border-rose-500 text-rose-500 bg-white dark:bg-reply-surface-dark"
                        : "border-transparent text-gray-400"
                    }`}
                  >
                    <span className="hidden sm:inline">
                      {step === 1 && "1. Contenido"}
                      {step === 2 && "2. Audiencia"}
                      {step === 3 && "3. Configuración"}
                    </span>
                    <span className="sm:hidden">{step}</span>
                  </div>
                ))}
              </div>

              <div className="p-6 md:p-10 flex-1 overflow-y-auto custom-scrollbar">
                {/* Step 1: Content */}
                {ctx.builderStep === 1 && (
                  <div className="space-y-8 animate-fade-in">
                    <div className="group">
                      <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 group-focus-within:text-rose-500 transition-colors">
                        Nombre de Campaña
                      </label>
                      <input
                        type="text"
                        value={ctx.campaignName}
                        onChange={(e) => ctx.setCampaignName(e.target.value)}
                        className="w-full bg-reply-bg dark:bg-gray-900 border border-gray-100 dark:border-reply-border-dark rounded-2xl px-6 py-4 focus:ring-4 focus:ring-rose-500/10 focus:border-rose-500 transition-all outline-none font-medium text-gray-900 dark:text-white"
                        placeholder="Ej: Promo Verano 2024"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">Canal de Difusión</label>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        {([
                          { ch: "WHATSAPP" as const, icon: <MessageSquare className="w-4 h-4" />, activeClass: "bg-emerald-500 text-white shadow-lg shadow-emerald-500/20" },
                          { ch: "EMAIL" as const, icon: <Mail className="w-4 h-4" />, activeClass: "bg-blue-500 text-white shadow-lg shadow-blue-500/20" },
                          { ch: "SMS" as const, icon: <SmsIcon className="w-4 h-4" />, activeClass: "bg-rose-500 text-white shadow-lg shadow-rose-500/20" },
                        ]).map(({ ch, icon, activeClass }) => (
                          <button
                            key={ch}
                            onClick={() => ctx.setSelectedChannel(ch)}
                            className={`flex items-center justify-center gap-3 py-4 rounded-2xl font-black text-xs uppercase tracking-widest transition-all ${
                              ctx.selectedChannel === ch ? activeClass : "bg-reply-bg dark:bg-gray-900 text-gray-500 border border-gray-100 dark:border-reply-border-dark hover:bg-gray-100"
                            }`}
                          >
                            {icon} {ch === "WHATSAPP" ? "WhatsApp" : ch === "EMAIL" ? "Email" : "SMS"}
                          </button>
                        ))}
                      </div>
                    </div>

                    {ctx.selectedChannel === "EMAIL" && (
                      <div className="animate-fade-in-down group">
                        <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 group-focus-within:text-blue-500 transition-colors">Asunto del Correo</label>
                        <input
                          type="text"
                          value={ctx.emailSubject}
                          onChange={(e) => ctx.setEmailSubject(e.target.value)}
                          className="w-full bg-reply-bg dark:bg-gray-900 border border-gray-100 dark:border-reply-border-dark rounded-2xl px-6 py-4 focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all outline-none font-medium text-gray-900 dark:text-white"
                          placeholder="¡Oferta Especial para ti!"
                        />
                      </div>
                    )}

                    <div className="group">
                      <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 group-focus-within:text-rose-500 transition-colors">Seleccionar Plantilla</label>
                      <div className="relative">
                        <select
                          value={ctx.selectedTemplateId}
                          onChange={(e) => ctx.handleTemplateChange(e.target.value)}
                          className="w-full appearance-none bg-reply-bg dark:bg-gray-900 border border-gray-100 dark:border-reply-border-dark rounded-2xl px-6 py-4 focus:ring-4 focus:ring-rose-500/10 focus:border-rose-500 transition-all outline-none font-medium text-gray-900 dark:text-white cursor-pointer"
                        >
                          <option value="">-- Seleccionar Template --</option>
                          {ctx.templates.map((t) => (
                            <option key={t.id} value={t.id}>{t.name}</option>
                          ))}
                        </select>
                        <ChevronRight className="w-5 h-5 absolute right-6 top-1/2 transform -translate-y-1/2 rotate-90 text-gray-400 pointer-events-none" />
                      </div>
                    </div>
                  </div>
                )}

                {/* Step 2: Audience */}
                {ctx.builderStep === 2 && (
                  <div className="space-y-8 animate-fade-in">
                    <div>
                      <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-6">Segmentación por Etiquetas</label>
                      <div className="flex flex-wrap gap-3">
                        {ctx.tags.map((tag) => (
                          <button
                            key={tag.id}
                            onClick={() => ctx.toggleTag(tag.id)}
                            className={`px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest border transition-all ${
                              ctx.selectedTags.includes(tag.id)
                                ? `${tag.color} ring-4 ring-rose-500/10 border-rose-500 shadow-lg`
                                : "bg-reply-bg dark:bg-gray-800 text-gray-400 border-gray-100 dark:border-reply-border-dark"
                            }`}
                          >
                            {tag.name}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="bg-rose-50 dark:bg-rose-500/5 p-8 rounded-[2rem] border border-rose-100 dark:border-rose-500/10 text-center relative overflow-hidden group">
                      <div className="absolute top-0 right-0 p-4 opacity-10 transform translate-x-4 -translate-y-4 transition-transform group-hover:translate-x-0 group-hover:translate-y-0 text-rose-500">
                        <Megaphone className="w-24 h-24" />
                      </div>
                      <div className="relative z-10">
                        <div className="text-5xl font-black text-rose-600 dark:text-rose-400 mb-2 tracking-tighter">{ctx.audienceCount}</div>
                        <div className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Contactos Estimados en Audiencia</div>
                      </div>
                    </div>

                    <div className="pt-8 border-t border-gray-100 dark:border-reply-border-dark">
                      <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">📊 Importar desde Base de Datos Externa (Excel)</label>
                      <div className="flex flex-col sm:flex-row gap-4 items-center">
                        <label className="w-full sm:w-auto cursor-pointer bg-white dark:bg-gray-800 border-2 border-dashed border-gray-200 dark:border-reply-border-dark rounded-2xl px-10 py-6 text-center hover:border-rose-500 transition-all flex flex-col items-center gap-2 group">
                          <Plus className="w-6 h-6 text-gray-300 group-hover:text-rose-500 transition-colors" />
                          <span className="text-[10px] font-black uppercase tracking-widest text-gray-500 group-hover:text-rose-500">Cargar Archivo</span>
                          <input type="file" accept=".xlsx, .xls, .csv" onChange={ctx.handleFileUpload} className="hidden" />
                        </label>
                        {ctx.excelFileName && (
                          <div className="bg-emerald-50 dark:bg-emerald-500/10 p-4 rounded-2xl border border-emerald-100 dark:border-emerald-500/20 flex items-center gap-3">
                            <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                            <div>
                              <p className="text-xs font-black text-emerald-700 dark:text-emerald-400 uppercase tracking-widest">{ctx.excelFileName}</p>
                              <p className="text-[10px] text-emerald-600 dark:text-emerald-500">{ctx.targetPhones.length} números importados</p>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Step 3: Config */}
                {ctx.builderStep === 3 && (
                  <div className="space-y-8 animate-fade-in">
                    <div className="bg-reply-bg/50 dark:bg-gray-900/50 p-8 rounded-[2rem] border border-gray-100 dark:border-reply-border-dark">
                      <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-6 flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-rose-500" /> Programación de Campaña
                      </h4>
                      <div className="grid grid-cols-2 gap-4 mb-6">
                        <button onClick={() => ctx.setScheduleMode("now")} className={`py-4 rounded-2xl font-black text-xs uppercase tracking-widest transition-all ${ctx.scheduleMode === "now" ? "bg-gray-900 dark:bg-white text-white dark:text-black shadow-xl" : "bg-white dark:bg-gray-800 text-gray-500 border border-gray-100 dark:border-reply-border-dark"}`}>
                          Lanzar Ahora
                        </button>
                        <button onClick={() => ctx.setScheduleMode("later")} className={`py-4 rounded-2xl font-black text-xs uppercase tracking-widest transition-all ${ctx.scheduleMode === "later" ? "bg-gray-900 dark:bg-white text-white dark:text-black shadow-xl" : "bg-white dark:bg-gray-800 text-gray-500 border border-gray-100 dark:border-reply-border-dark"}`}>
                          Programar
                        </button>
                      </div>
                      {ctx.scheduleMode === "later" && (
                        <div className="animate-fade-in-down">
                          <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">Fecha y Hora de Inicio</label>
                          <input type="datetime-local" value={ctx.scheduledDate} onChange={(e) => ctx.setScheduledDate(e.target.value)} className="w-full bg-white dark:bg-gray-900 border border-gray-100 dark:border-reply-border-dark rounded-2xl px-6 py-4 focus:ring-4 focus:ring-rose-500/10 focus:border-rose-500 transition-all outline-none font-medium text-gray-900 dark:text-white" />
                        </div>
                      )}
                    </div>

                    <div className="bg-reply-bg/50 dark:bg-gray-900/50 p-8 rounded-[2rem] border border-gray-100 dark:border-reply-border-dark">
                      <div className="flex justify-between items-center mb-6">
                        <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                          <Zap className="w-4 h-4 text-amber-500" /> Velocidad y Anti-Spam
                        </h4>
                        <span className="text-xs font-black text-rose-500 bg-rose-50 dark:bg-rose-500/10 px-3 py-1 rounded-full">{ctx.config.messagesPerMinute} msgs/min</span>
                      </div>
                      <input type="range" min="1" max="120" step="1" value={ctx.config.messagesPerMinute} onChange={(e) => ctx.setConfig({ ...ctx.config, messagesPerMinute: Number(e.target.value) })} className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-rose-500" />
                      <div className="flex justify-between text-[10px] font-black text-gray-400 uppercase tracking-widest mt-4">
                        <span>Lento (Seguro)</span>
                        <span>Rápido (Agresivo)</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Footer Actions */}
              <div className="p-8 border-t border-gray-100 dark:border-reply-border-dark bg-reply-bg/50 dark:bg-gray-800/10 flex justify-between">
                {ctx.builderStep > 1 ? (
                  <button onClick={() => ctx.setBuilderStep(ctx.builderStep - 1)} className="px-8 py-4 rounded-[1.25rem] border border-gray-100 dark:border-reply-border-dark font-black text-[10px] uppercase tracking-widest text-gray-500 hover:bg-gray-100 transition-all active:scale-95">Regresar</button>
                ) : <div />}
                {ctx.builderStep < 3 ? (
                  <button onClick={() => ctx.setBuilderStep(ctx.builderStep + 1)} disabled={ctx.builderStep === 1 && (!ctx.selectedTemplateId || !ctx.campaignName)} className="px-10 py-4 bg-gray-900 dark:bg-white text-white dark:text-black rounded-[1.25rem] font-black text-[10px] uppercase tracking-widest shadow-xl transition-all hover:scale-105 active:scale-95 disabled:opacity-30 disabled:hover:scale-100">
                    Siguiente Paso
                  </button>
                ) : (
                  <button onClick={ctx.handleLaunch} disabled={ctx.isSending || ctx.audienceCount === 0} className="px-10 py-4 bg-rose-600 hover:bg-rose-700 text-white rounded-[1.25rem] font-black text-[10px] uppercase tracking-widest shadow-xl shadow-rose-600/20 transition-all hover:scale-105 active:scale-95 disabled:opacity-30 flex items-center gap-3">
                    {ctx.isSending ? <Zap className="w-4 h-4 animate-spin" /> : <Rocket className="w-4 h-4" />}
                    {ctx.isSending ? "Procesando..." : ctx.editingCampaignId ? "Guardar Cambios" : "Lanzar Campaña"}
                  </button>
                )}
              </div>
            </div>

            {/* PREVIEW PANEL */}
            <div className="hidden lg:flex lg:w-1/3 flex-col bg-[#e5ddd5] dark:bg-[#070b0e] rounded-[3rem] border border-gray-100 dark:border-reply-border-dark relative overflow-hidden shadow-inner">
              <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'url("https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png")' }}></div>
              <div className="z-10 w-full px-8 py-20 flex flex-col items-center">
                <div className="text-[10px] font-black text-gray-500 uppercase tracking-[0.3em] mb-10 opacity-30">Previsualización Real</div>
                <div className="w-full max-w-[300px] bg-white dark:bg-reply-panel-dark rounded-3xl shadow-2xl p-4 relative group">
                  <div className="absolute top-0 left-0 w-full h-1.5 bg-rose-500 rounded-t-3xl shadow-sm shadow-rose-500/50"></div>
                  {ctx.selectedTemplateId ? (
                    <div className="text-xs text-gray-800 dark:text-gray-200 whitespace-pre-wrap leading-relaxed py-4 font-medium">
                      {(() => {
                        const t = ctx.getSelectedTemplate();
                        if (!t) return "Error cargando plantilla";
                        const body = Array.isArray(t.components) ? t.components.find((c) => c.type === "BODY") : null;
                        return body ? body.text : "Sin contenido";
                      })()}
                    </div>
                  ) : (
                    <div className="text-center text-gray-300 py-16 italic text-[10px] font-medium animate-pulse uppercase tracking-widest">Selecciona una plantilla</div>
                  )}
                  <div className="flex justify-end pr-2">
                    <div className="text-[9px] font-black text-gray-400 opacity-50 uppercase tracking-tighter">
                      {new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── TEMPLATES ── */}
        {ctx.activeSection === "templates" && (
          <TemplateGallery
            templates={ctx.templates}
            onSelectTemplate={(id) => {
              ctx.setSelectedTemplateId(id);
              ctx.setActiveSection("builder");
            }}
            onEditTemplate={(t, bodyContent) => {
              ctx.setNewTemplate({
                id: t.id,
                name: t.name,
                category: t.category as "MARKETING" | "UTILITY" | "AUTHENTICATION",
                content: bodyContent,
                subject: t.subject || "",
                preheader: "",
              });
              ctx.setIsCreatingTemplate(true);
            }}
            onDeleteTemplate={ctx.handleDeleteTemplate}
            onCreateNew={() => ctx.setIsCreatingTemplate(true)}
          />
        )}

        {/* ── HISTORY ── */}
        {ctx.activeSection === "history" && (
          <CampaignHistory
            campaigns={ctx.filteredCampaigns}
            historySearch={ctx.historySearch}
            onSearchChange={ctx.setHistorySearch}
            onEdit={ctx.handleEditCampaign}
            onDelete={ctx.handleDeleteCampaign}
          />
        )}

        {/* ── TEMPLATE EDITOR (Full-screen modal) ── */}
        {ctx.isCreatingTemplate && (
          <div className="fixed inset-0 z-[100] bg-reply-bg dark:bg-reply-bg-dark flex flex-col animate-fade-in font-sans">
            {/* Toolbar */}
            <div className="h-16 px-6 bg-white dark:bg-reply-panel-dark border-b border-gray-200 dark:border-reply-border-dark flex justify-between items-center shadow-sm z-30 relative">
              <div className="flex items-center gap-4">
                <button onClick={() => ctx.setIsCreatingTemplate(false)} className="p-2 -ml-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 transition-colors">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                </button>
                <div className="flex flex-col">
                  <input type="text" value={ctx.newTemplate.name} onChange={(e) => ctx.setNewTemplate({ ...ctx.newTemplate, name: e.target.value })} placeholder="Nueva Plantilla Sin Título" className="font-bold text-gray-800 dark:text-white bg-transparent outline-none placeholder-gray-400 w-64" />
                  <div className="flex items-center gap-2 text-xs text-gray-400">
                    <span className="uppercase tracking-wider font-semibold">{ctx.newTemplate.category}</span>
                    <span>•</span>
                    <span>{ctx.newTemplate.content?.length || 0} caracteres</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {/* Undo/Redo */}
                <div className="flex bg-gray-100 dark:bg-gray-800 rounded-lg p-1 border border-gray-200 dark:border-reply-border-dark mr-2">
                  <button onClick={ctx.manualUndo} disabled={ctx.historyIndex <= 0} className="p-2 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 disabled:opacity-30 transition-colors" title="Deshacer">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" /></svg>
                  </button>
                  <button onClick={ctx.manualRedo} disabled={ctx.historyIndex >= ctx.historyStack.length - 1} className="p-2 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 disabled:opacity-30 transition-colors" title="Rehacer">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 10h-10a8 8 0 00-8 8v2M21 10l-6 6m6-6l-6-6" /></svg>
                  </button>
                </div>
                <div className="h-8 w-px bg-gray-200 dark:bg-gray-700 mx-2"></div>
                <button onClick={() => toast.success("Prueba de envío simulada a " + (localStorage.getItem("userEmail") || "tu correo"))} className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-bold text-gray-700 dark:text-gray-300 hover:bg-reply-bg dark:hover:bg-gray-800 transition-colors">Enviar Test</button>
                <button onClick={ctx.handleCreateTemplate} disabled={!ctx.newTemplate.name || !ctx.newTemplate.content} className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold shadow-lg shadow-indigo-500/30 disabled:opacity-50 disabled:shadow-none transition-all flex items-center gap-2">
                  <span>Guardar</span>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                </button>
              </div>
            </div>

            {/* Workspace */}
            <div className="flex-1 flex overflow-hidden">
              {/* LEFT: AI Prompt + Code */}
              <div className="w-[420px] flex flex-col border-r border-gray-200 dark:border-reply-border-dark bg-white dark:bg-reply-surface-dark z-20 shadow-lg relative">
                <div className={`flex flex-col transition-all duration-500 ease-in-out ${ctx.showCodeEditor ? "h-[45%]" : "h-full"} overflow-hidden`}>
                  {/* AI Prompt */}
                  <div className="p-6 border-b border-gray-200 dark:border-reply-border-dark bg-reply-bg dark:bg-reply-bg-dark/40 shrink-0">
                    <div className="flex justify-between items-center mb-3">
                      <label className="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-widest flex items-center gap-2">
                        <div className="w-6 h-6 rounded-lg bg-indigo-100 dark:bg-indigo-500/20 flex items-center justify-center text-indigo-600 dark:text-indigo-400">⚡</div>
                        <span>AI Copilot</span>
                      </label>
                      <div className="flex items-center gap-2 bg-gray-200 dark:bg-gray-800 rounded-full p-1 pl-3">
                        <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Dev Mode</span>
                        <button onClick={() => ctx.setShowCodeEditor(!ctx.showCodeEditor)} className={`w-9 h-5 rounded-full transition-all duration-300 relative shadow-sm ${ctx.showCodeEditor ? "bg-indigo-500" : "bg-gray-400 dark:bg-gray-600"}`}>
                          <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all shadow-sm ${ctx.showCodeEditor ? "translate-x-4.5 left-0.5" : "left-0.5"}`}></div>
                        </button>
                      </div>
                    </div>
                    <div className="relative group">
                      <textarea
                        value={ctx.aiPrompt}
                        onChange={(e) => ctx.setAiPrompt(e.target.value)}
                        placeholder={ctx.newTemplate.content ? "Describe qué cambios quieres hacer..." : "Describe tu email ideal para empezar..."}
                        className="relative w-full border border-gray-200 dark:border-reply-border-dark rounded-xl p-4 pr-12 text-sm bg-white dark:bg-reply-bg-dark shadow-sm text-gray-700 dark:text-gray-200 focus:ring-2 ring-indigo-500/50 outline-none resize-none h-32 transition-all placeholder-gray-400 dark:placeholder-gray-600"
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            if (ctx.aiPrompt && !ctx.isGeneratingAI) ctx.handleGenerateAI();
                          }
                        }}
                      />
                      <button onClick={ctx.handleGenerateAI} disabled={ctx.isGeneratingAI || !ctx.aiPrompt} className="absolute bottom-3 right-3 p-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg shadow-lg shadow-indigo-500/30 disabled:opacity-50 disabled:shadow-none transition-all hover:scale-105 active:scale-95 z-10">
                        {ctx.isGeneratingAI ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>}
                      </button>
                    </div>
                  </div>

                  {/* Tools */}
                  <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-thin scrollbar-thumb-gray-200 dark:scrollbar-thumb-gray-700">
                    {ctx.isGeneratingAI && (
                      <div className="flex items-center gap-3 p-3 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-800 rounded-xl animate-pulse">
                        <div className="w-2 h-2 bg-indigo-500 rounded-full animate-ping"></div>
                        <span className="text-xs font-bold text-indigo-700 dark:text-indigo-300 font-mono">{ctx.generationStatus}</span>
                      </div>
                    )}
                    <div>
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3 block">Bancos de Datos</label>
                      <div className="flex flex-col gap-2">
                        <div className="relative group">
                          <select className="w-full appearance-none border border-gray-200 dark:border-reply-border-dark rounded-xl px-4 py-3 text-sm bg-reply-bg dark:bg-reply-panel-dark text-gray-700 dark:text-gray-200 outline-none hover:border-indigo-300 dark:hover:border-indigo-700 transition-colors cursor-pointer" onChange={(e) => { if (e.target.value) { ctx.insertVariable(e.target.value); e.target.value = ""; } }}>
                            <option value="">Insertar Variable Dinámica...</option>
                            <option value="contact.firstName">👤 Nombre del Contacto</option>
                            <option value="contact.company">🏢 Empresa</option>
                            <option value="agent.name">🧑‍💼 Nombre Agente</option>
                          </select>
                        </div>
                      </div>
                    </div>
                    <div>
                      <button onClick={() => ctx.setShowMediaLibrary(true)} className="w-full aspect-[3/1] border-2 border-dashed border-gray-200 dark:border-reply-border-dark hover:border-indigo-500/50 hover:bg-indigo-50/50 dark:hover:bg-indigo-900/10 rounded-xl flex flex-col items-center justify-center gap-2 text-sm text-gray-500 dark:text-gray-400 transition-all group">
                        <div className="p-2 bg-gray-100 dark:bg-gray-800 rounded-full group-hover:scale-110 transition-transform">
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                        </div>
                        <span className="font-medium">Abrir Galería Multimedia</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Code Editor */}
                <div className={`border-t border-gray-200 dark:border-reply-border-dark bg-[#1e1e1e] flex flex-col transition-all duration-500 ease-in-out ${ctx.showCodeEditor ? "flex-1" : "h-0 overflow-hidden"}`}>
                  <div className="flex justify-between items-center px-4 py-2 bg-[#252526] border-b border-[#3e3e42] shrink-0">
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] uppercase font-bold text-gray-500 font-mono tracking-wider">Editor HTML</span>
                      <span className="text-[10px] text-green-500 font-mono flex items-center gap-1">● Live</span>
                    </div>
                    <div className="flex gap-2 text-[10px] text-gray-500 font-mono">
                      <span>Ln {ctx.newTemplate.content?.split("\n").length || 0}</span>
                      <span>UTF-8</span>
                    </div>
                  </div>
                  <textarea
                    ref={ctx.editorRef}
                    value={ctx.newTemplate.content}
                    onChange={(e) => ctx.setNewTemplate({ ...ctx.newTemplate, content: e.target.value })}
                    className="flex-1 w-full bg-[#1e1e1e] text-[#d4d4d4] font-mono text-xs p-4 focus:outline-none resize-none leading-relaxed selection:bg-indigo-500/30"
                    spellCheck={false}
                    placeholder="<!-- El código HTML generado aparecerá aquí -->"
                  />
                </div>
              </div>

              {/* RIGHT: Preview */}
              <div className="flex-1 bg-gray-200/50 dark:bg-[#070b0e] relative flex flex-col items-center justify-center p-8 overflow-hidden">
                {ctx.newTemplate.content ? (
                  <div className={`transition-all duration-300 overflow-hidden shadow-2xl relative ${ctx.previewDevice === "mobile" ? "w-[375px] h-[700px] rounded-[30px] border-[8px] border-gray-800 bg-black" : "w-full h-full max-w-4xl rounded-lg border border-gray-300 dark:border-reply-border-dark"}`}>
                    {ctx.previewDevice === "mobile" && (
                      <div className="absolute top-0 w-full h-6 bg-black z-20 flex justify-between px-6 items-center">
                        <div className="text-[10px] text-white font-bold">9:41</div>
                        <div className="flex gap-1"><div className="w-3 h-3 bg-white rounded-full opacity-0"></div></div>
                      </div>
                    )}
                    <iframe
                      srcDoc={ctx.previewDarkMode ? ctx.newTemplate.content + `<style>body { background-color: #121212 !important; color: #e0e0e0 !important; } td { color: #e0e0e0 !important; } a { color: #8ab4f8 !important; } .wrapper { background-color: #1e1e1e !important; }</style>` : ctx.newTemplate.content}
                      className="w-full h-full bg-white transition-colors"
                      title="Preview"
                      sandbox="allow-same-origin"
                    />
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center text-center opacity-40">
                    <div className="w-32 h-32 bg-gray-300 dark:bg-gray-800 rounded-full flex items-center justify-center mb-6 animate-pulse">
                      <span className="text-4xl grayscale">🎨</span>
                    </div>
                    <h3 className="text-2xl font-bold text-gray-800 dark:text-gray-200">Espacio de Trabajo</h3>
                    <p className="text-gray-500 max-w-xs mt-2">Usa el panel izquierdo para generar tu primera plantilla profesional.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── MEDIA LIBRARY MODAL ── */}
        {ctx.showMediaLibrary && (
          <div className="fixed inset-0 z-[110] bg-black/50 backdrop-blur-sm flex items-center justify-center p-8 animate-fade-in">
            <div className="bg-white dark:bg-reply-panel-dark rounded-2xl shadow-2xl w-full max-w-4xl h-[80vh] overflow-hidden flex flex-col relative animate-scale-in">
              <div className="p-4 border-b border-gray-200 dark:border-reply-border-dark flex justify-between items-center bg-reply-bg dark:bg-reply-surface-dark">
                <h3 className="font-bold text-lg dark:text-white flex items-center gap-2">🖼️ Galería Multimedia</h3>
                <button onClick={() => ctx.setShowMediaLibrary(false)} className="text-gray-500 hover:text-gray-700 w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">✕</button>
              </div>
              <div className="flex-1 overflow-hidden relative">
                <MediaLibrary
                  onSelect={(media) => {
                    const imgTag = `<img src="${media.url}" alt="Imagen" style="max-width: 100%; height: auto; border: 0; display: block;" />`;
                    ctx.setNewTemplate((prev) => ({ ...prev, content: prev.content + "\n" + imgTag }));
                    ctx.setShowMediaLibrary(false);
                    toast.success("Imagen insertada");
                  }}
                  onClose={() => ctx.setShowMediaLibrary(false)}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
