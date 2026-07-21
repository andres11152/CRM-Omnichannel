import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  ShoppingBag, 
  MessageSquare, 
  Zap, 
  Mail, 
  Plus, 
  Trash2, 
  Globe, 
  Copy, 
  ArrowRightLeft,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Search,
  Filter,
  Layers,
  ChevronRight
} from "lucide-react";
import { marketplaceService, GlobalInventory } from "@/services/marketplaceService";
import { ModuleHeader } from "@/components/common/ModuleHeader";
import { toast } from "sonner";
import { getModuleCache, setModuleCache } from "@/lib/moduleCache";

const MARKETPLACE_CACHE_KEY = "marketplace:inventory";

export const GlobalTemplateMarketplace: React.FC = () => {
  const { t: translate } = useTranslation();
  // Stale-while-revalidate: instant render on module re-entry, silent refetch
  const cachedInventory = getModuleCache<GlobalInventory>(MARKETPLACE_CACHE_KEY);
  const [inventory, setInventory] = useState<GlobalInventory>(cachedInventory ?? { templates: [], workflows: [] });
  const [loading, setLoading] = useState(!cachedInventory);
  const [activeTab, setActiveTab] = useState<"templates" | "flows">("templates");
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    fetchInventory();
  }, []);

  const fetchInventory = async () => {
    if (!getModuleCache<GlobalInventory>(MARKETPLACE_CACHE_KEY)) {
      setLoading(true);
    }
    try {
      const data = await marketplaceService.getInventory();
      setInventory(data);
      setModuleCache<GlobalInventory>(MARKETPLACE_CACHE_KEY, data);
    } catch (error) {
      toast.error(translate("global_template_marketplace.toast.load_error", "Error al cargar inventario"));
    } finally {
      setLoading(false);
    }
  };

  const handleToggleGlobal = async (id: string, currentStatus: boolean, type: "template" | "flow") => {
    try {
      if (type === "template") {
        await marketplaceService.toggleTemplate(id, !currentStatus);
      } else {
        await marketplaceService.toggleWorkflow(id, !currentStatus);
      }
      toast.success(translate("global_template_marketplace.toast.status_updated", "Estado actualizado"));
      fetchInventory();
    } catch (error) {
      toast.error(translate("global_template_marketplace.toast.update_error", "Error al actualizar"));
    }
  };

  const filteredTemplates = inventory.templates.filter(t => 
    t.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    t.category.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredWorkflows = inventory.workflows.filter(w => 
    w.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full bg-reply-bg dark:bg-reply-bg-dark animate-in fade-in duration-500 overflow-hidden">
      <ModuleHeader
        title="Template Marketplace"
        description="Gestión de plantillas maestras y flujos de automatización globales"
        icon={<ShoppingBag className="w-8 h-8 text-white" />}
        gradient="from-slate-800 via-slate-900 to-amber-900 dark:from-black dark:via-slate-900 dark:to-amber-950"
        stats={{
          label: "Total Master Assets",
          value: inventory.templates.length + inventory.workflows.length
        }}
        action={
          <button 
            onClick={fetchInventory}
            className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-sm font-bold backdrop-blur-md border border-white/20 transition-all"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Sincronizar
          </button>
        }
      />

      <div className="flex-1 flex flex-col p-6 md:p-8 space-y-6 overflow-hidden">
        {/* Navigation & Search */}
        <div className="flex flex-col md:flex-row justify-between items-center gap-4 bg-white dark:bg-reply-panel-dark p-4 rounded-2xl border border-slate-200 dark:border-reply-border-dark shadow-sm">
           <div className="flex bg-slate-100 dark:bg-white/5 p-1 rounded-xl w-full md:w-auto">
              <button 
                onClick={() => setActiveTab("templates")}
                className={`flex-1 md:flex-none flex items-center gap-2 px-6 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'templates' ? 'bg-white dark:bg-reply-surface-dark text-amber-600 shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
              >
                <MessageSquare className="w-4 h-4" />
                Plantillas (WA/Email)
              </button>
              <button 
                onClick={() => setActiveTab("flows")}
                className={`flex-1 md:flex-none flex items-center gap-2 px-6 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'flows' ? 'bg-white dark:bg-reply-surface-dark text-amber-600 shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
              >
                <Zap className="w-4 h-4" />
                Automation Flows
              </button>
           </div>

           <div className="relative w-full md:w-80">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input 
                type="text" 
                placeholder="Buscar recursos maestros..." 
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl text-xs focus:ring-2 focus:ring-amber-500 outline-none transition-all dark:text-white"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
           </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto custom-scrollbar pr-2">
          {loading ? (
            <div className="h-64 flex flex-col items-center justify-center gap-4 text-slate-400">
               <RefreshCw className="w-10 h-10 animate-spin text-amber-500" />
               <p className="font-bold">Consultando Marketplace...</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
               {activeTab === "templates" ? (
                 filteredTemplates.length > 0 ? (
                   filteredTemplates.map((template) => (
                    <TemplateCard 
                      key={template.id} 
                      template={template} 
                      onToggle={() => handleToggleGlobal(template.id, true, "template")} 
                    />
                   ))
                 ) : (
                   <EmptyState icon={<MessageSquare />} text="No hay plantillas maestras configuradas" />
                 )
               ) : (
                 filteredWorkflows.length > 0 ? (
                   filteredWorkflows.map((flow) => (
                    <FlowCard 
                      key={flow.id} 
                      flow={flow} 
                      onToggle={() => handleToggleGlobal(flow.id, true, "flow")} 
                    />
                   ))
                 ) : (
                   <EmptyState icon={<Zap />} text="No hay flujos de automatización globales" />
                 )
               )}
            </div>
          )}
        </div>

        {/* Distribution Banner */}
        <div className="bg-gradient-to-r from-amber-500/10 to-orange-500/10 border border-amber-500/20 rounded-2xl p-6 flex flex-col md:flex-row items-center justify-between gap-6 relative overflow-hidden group">
           <div className="absolute -right-4 -bottom-4 opacity-5 group-hover:scale-110 transition-transform">
              <Globe className="w-32 h-32" />
           </div>
           <div className="flex gap-4 items-start relative z-10">
              <div className="p-3 bg-amber-500 text-white rounded-2xl shadow-lg shadow-amber-500/30">
                 <Globe className="w-6 h-6" />
              </div>
              <div>
                 <h4 className="font-black text-slate-800 dark:text-white text-lg">Distribución Automática Activa</h4>
                 <p className="text-sm text-slate-500 dark:text-slate-400 max-w-xl">
                   Todos los recursos marcados con <span className="text-amber-600 font-bold uppercase text-[10px] bg-amber-100 px-2 py-0.5 rounded ml-1">MASTER</span> serán clonados automáticamente en cada nueva cuenta creada. 
                   Asegúrate de que las variables (`&#123;&#123;name&#125;&#125;`, etc) sean genéricas.
                 </p>
              </div>
           </div>
           <div className="flex gap-2 relative z-10 w-full md:w-auto">
              <div className="bg-white/50 dark:bg-black/20 px-4 py-2 rounded-xl text-xs font-bold text-amber-700 dark:text-amber-400 border border-amber-500/20 flex items-center gap-2">
                 <CheckCircle2 className="w-4 h-4" />
                 Sincronización Onboarding OK
              </div>
           </div>
        </div>
      </div>
    </div>
  );
};

interface TemplateCardProps {
  template: {
    id: string;
    name: string;
    channel: string;
    category: string;
    language: string;
    company: { name: string };
  };
  onToggle: () => void;
}

const TemplateCard: React.FC<TemplateCardProps> = ({ template, onToggle }) => (
  <div className="bg-white dark:bg-reply-panel-dark rounded-2xl border border-slate-200 dark:border-reply-border-dark p-6 flex flex-col gap-4 hover:border-amber-500/30 transition-all group shadow-sm">
     <div className="flex justify-between items-start">
        <div className={`p-3 rounded-2xl ${template.channel === 'WHATSAPP' ? 'bg-emerald-500/10 text-emerald-600' : 'bg-indigo-500/10 text-indigo-600'}`}>
           {template.channel === 'WHATSAPP' ? <MessageSquare className="w-6 h-6" /> : <Mail className="w-6 h-6" />}
        </div>
        <button onClick={onToggle} className="p-2 text-slate-400 hover:text-rose-500 transition-colors opacity-0 group-hover:opacity-100">
           <Trash2 className="w-4 h-4" />
        </button>
     </div>
     <div className="flex-1">
        <div className="flex items-center gap-2 mb-1">
           <h4 className="font-black text-slate-800 dark:text-white truncate">{template.name}</h4>
           <span className="text-[9px] font-black uppercase tracking-widest bg-amber-500 text-white px-2 py-0.5 rounded">Master</span>
        </div>
        <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">{template.category} • {template.language.toUpperCase()}</p>
     </div>
     <div className="pt-4 border-t border-slate-50 dark:border-white/5 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400">
           <Building2 className="w-3 h-3" />
           Origin: {template.company.name}
        </div>
        <div className="flex items-center gap-1 text-[10px] font-black text-emerald-500 uppercase tracking-widest">
           <CheckCircle2 className="w-3 h-3" />
           Ready
        </div>
     </div>
  </div>
);

interface FlowCardProps {
  flow: {
    id: string;
    name: string;
    description?: string;
    triggerType: string;
  };
  onToggle: () => void;
}

const FlowCard: React.FC<FlowCardProps> = ({ flow, onToggle }) => (
  <div className="bg-white dark:bg-reply-panel-dark rounded-2xl border border-slate-200 dark:border-reply-border-dark p-6 flex flex-col gap-4 hover:border-amber-500/30 transition-all group shadow-sm">
     <div className="flex justify-between items-start">
        <div className="p-3 rounded-2xl bg-amber-500/10 text-amber-600">
           <Zap className="w-6 h-6" />
        </div>
        <button onClick={onToggle} className="p-2 text-slate-400 hover:text-rose-500 transition-colors opacity-0 group-hover:opacity-100">
           <Trash2 className="w-4 h-4" />
        </button>
     </div>
     <div className="flex-1">
        <div className="flex items-center gap-2 mb-1">
           <h4 className="font-black text-slate-800 dark:text-white truncate">{flow.name}</h4>
           <span className="text-[9px] font-black uppercase tracking-widest bg-amber-500 text-white px-2 py-0.5 rounded">Master</span>
        </div>
        <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">{flow.description || "Sin descripción"}</p>
     </div>
     <div className="pt-4 border-t border-slate-50 dark:border-white/5 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400">
           <Layers className="w-3 h-3" />
           Trigger: {flow.triggerType}
        </div>
        <div className="flex items-center gap-1 text-[10px] font-black text-emerald-500 uppercase tracking-widest">
           <CheckCircle2 className="w-3 h-3" />
           Live
        </div>
     </div>
  </div>
);

interface EmptyStateProps {
  icon: React.ReactNode;
  text: string;
}

const EmptyState: React.FC<EmptyStateProps> = ({ icon, text }) => (
  <div className="col-span-full h-64 flex flex-col items-center justify-center text-slate-400 gap-4 bg-white/50 dark:bg-white/5 rounded-3xl border border-dashed border-slate-200 dark:border-white/10">
     <div className="opacity-20 scale-150">
        {icon}
     </div>
     <p className="font-bold tracking-tight">{text}</p>
  </div>
);

const Building2: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
  </svg>
);
