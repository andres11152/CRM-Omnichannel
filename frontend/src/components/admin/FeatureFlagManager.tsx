import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  Flag, 
  Search, 
  Building2, 
  ToggleLeft, 
  ToggleRight, 
  Zap, 
  Mail, 
  Share2, 
  Lock, 
  Smartphone,
  LayoutGrid,
  Bot,
  MessageSquare,
  Users,
  Save,
  CheckCircle2,
  Info,
  RefreshCw
} from "lucide-react";
import { featureFlagService, FeatureFlags } from "@/services/featureFlagService";
import { adminService } from "@/services/adminService";
import { ModuleHeader } from "@/components/common/ModuleHeader";
import { toast } from "sonner";

interface CompanyItem {
  id: string;
  name: string;
  slug: string;
}

export const FeatureFlagManager: React.FC = () => {
  const { t } = useTranslation();
  const [companies, setCompanies] = useState<CompanyItem[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);
  const [flags, setFlags] = useState<FeatureFlags | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    fetchCompanies();
  }, []);

  const fetchCompanies = async () => {
    try {
      const data = await adminService.getAllCompanies();
      setCompanies(data);
    } catch (error) {
      console.error("Failed to fetch companies", error);
    }
  };

  const handleCompanySelect = async (companyId: string) => {
    setSelectedCompanyId(companyId);
    setLoading(true);
    try {
      const data = await featureFlagService.getCompanyFlags(companyId);
      setFlags(data);
    } catch (error) {
      toast.error(t("feature_flag_manager.toast.load_error", "Error al cargar flags"));
    } finally {
      setLoading(false);
    }
  };

  const toggleFlag = (key: keyof FeatureFlags) => {
    if (!flags) return;
    setFlags({ ...flags, [key]: !flags[key] });
  };

  const handleSave = async () => {
    if (!selectedCompanyId || !flags) return;
    setSaving(true);
    try {
      await featureFlagService.updateCompanyFlags(selectedCompanyId, flags);
      toast.success(t("feature_flag_manager.toast.saved", "Flags actualizados"));
    } catch (error) {
      toast.error(t("feature_flag_manager.toast.save_error", "Error al guardar"));
    } finally {
      setSaving(false);
    }
  };

  const filteredCompanies = companies.filter(c => 
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    c.slug.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const FEATURE_META: Record<keyof FeatureFlags, { label: string; description: string; icon: React.ElementType }> = {
    advanced_ai: { 
      label: "IA Avanzada (Gemini/OpenAI)", 
      description: "Habilita modelos de lenguaje avanzados y agentes inteligentes complejos.",
      icon: Bot
    },
    email_module: { 
      label: "Módulo de Email", 
      description: "Activa la capacidad de enviar y recibir correos electrónicos en el CRM.",
      icon: Mail
    },
    bulk_marketing: { 
      label: "Marketing Masivo", 
      description: "Permite el envío de campañas a listas de contactos masivas.",
      icon: Share2
    },
    api_access: { 
      label: "Acceso a API Externa", 
      description: "Habilita el gateway de API para integraciones de terceros.",
      icon: Zap
    },
    group_sync: { 
      label: "Sincronización de Grupos", 
      description: "Indexación automática de participantes de grupos de WhatsApp.",
      icon: Smartphone
    },
    kanban_deals: { 
      label: "Pipeline Visual (Kanban)", 
      description: "Habilita la vista de tarjetas para el seguimiento de ventas.",
      icon: LayoutGrid
    },
    voice_messages: { 
      label: "Mensajes de Voz IA", 
      description: "Transcripción y análisis de sentimientos en notas de voz.",
      icon: MessageSquare
    },
    automation_flows: { 
      label: "Flujos de Automatización", 
      description: "Diseñador de flows visual para chatbots y procesos.",
      icon: Zap
    },
    team_collaboration: { 
      label: "Colaboración de Equipo", 
      description: "Notas internas, menciones y asignación avanzada.",
      icon: Users
    }
  };

  return (
    <div className="flex flex-col h-full bg-reply-bg dark:bg-reply-bg-dark animate-in fade-in duration-500 overflow-hidden">
      <ModuleHeader
        title="Feature Flag Manager"
        description="Gestión granular de capacidades y overrides por tenant"
        icon={<Flag className="w-8 h-8 text-white" />}
        gradient="from-slate-800 via-slate-900 to-rose-900 dark:from-black dark:via-slate-900 dark:to-rose-950"
        stats={selectedCompanyId ? {
          label: "Selected Tenant",
          value: companies.find(c => c.id === selectedCompanyId)?.name || "Unknown"
        } : undefined}
        action={
          selectedCompanyId && (
            <button 
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-sm font-bold shadow-lg shadow-rose-600/20 transition-all active:scale-95 disabled:opacity-50"
            >
              {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Guardar Configuración
            </button>
          )
        }
      />

      <div className="flex-1 flex overflow-hidden">
        {/* Company Selector Sidebar */}
        <div className="w-80 flex flex-col border-r border-slate-200 dark:border-reply-border-dark bg-white dark:bg-reply-panel-dark shadow-sm">
          <div className="p-4 border-b border-slate-100 dark:border-reply-border-dark">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input 
                type="text" 
                placeholder="Buscar empresa..." 
                className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl text-xs focus:ring-2 focus:ring-rose-500 outline-none transition-all dark:text-white"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-2">
            {filteredCompanies.map(company => (
              <button
                key={company.id}
                onClick={() => handleCompanySelect(company.id)}
                className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all border text-left group ${
                  selectedCompanyId === company.id 
                    ? "bg-rose-50 dark:bg-rose-900/10 border-rose-500 dark:border-rose-400" 
                    : "bg-white dark:bg-transparent border-transparent hover:bg-slate-50 dark:hover:bg-white/5"
                }`}
              >
                <div className={`p-2 rounded-lg ${selectedCompanyId === company.id ? 'bg-rose-500 text-white' : 'bg-slate-100 dark:bg-white/5 text-slate-400 group-hover:text-slate-600'}`}>
                  <Building2 className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <p className={`text-sm font-bold truncate ${selectedCompanyId === company.id ? 'text-rose-700 dark:text-rose-400' : 'text-slate-700 dark:text-slate-200'}`}>
                    {company.name}
                  </p>
                  <p className="text-[10px] text-slate-400 font-mono truncate">{company.slug}</p>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Feature Grid */}
        <div className="flex-1 p-8 overflow-y-auto custom-scrollbar bg-slate-50/30 dark:bg-transparent">
          {!selectedCompanyId ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 space-y-4">
              <div className="p-6 bg-white dark:bg-reply-panel-dark rounded-full border border-slate-200 dark:border-reply-border-dark shadow-sm">
                 <Flag className="w-12 h-12 opacity-20" />
              </div>
              <p className="font-bold tracking-tight text-lg">Selecciona un tenant para gestionar sus features</p>
              <p className="text-sm">Puedes activar módulos premium independientemente del plan contratado.</p>
            </div>
          ) : loading ? (
            <div className="h-full flex items-center justify-center">
              <RefreshCw className="w-10 h-10 text-rose-500 animate-spin" />
            </div>
          ) : (
            <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-500">
               <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xl font-black text-slate-800 dark:text-white">Feature Overrides</h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400 italic">Los cambios aplicados aquí tienen prioridad sobre los límites del plan.</p>
                  </div>
                  <div className="bg-emerald-500/10 text-emerald-600 px-4 py-1.5 rounded-full border border-emerald-500/20 text-xs font-black uppercase flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4" />
                    Auditable Mode
                  </div>
               </div>

               <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                 {(Object.keys(FEATURE_META) as Array<keyof FeatureFlags>).map((key) => {
                   const meta = FEATURE_META[key];
                   const Icon = meta.icon;
                   const isEnabled = flags?.[key];

                   return (
                     <div 
                      key={key} 
                      onClick={() => toggleFlag(key)}
                      className={`p-6 rounded-2xl border transition-all cursor-pointer group relative overflow-hidden ${
                        isEnabled 
                          ? "bg-white dark:bg-reply-panel-dark border-emerald-500/30 shadow-md shadow-emerald-500/5" 
                          : "bg-white dark:bg-reply-panel-dark border-slate-200 dark:border-reply-border-dark grayscale opacity-80 hover:grayscale-0 hover:opacity-100"
                      }`}
                     >
                       {isEnabled && (
                         <div className="absolute top-0 right-0 p-3">
                           <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
                         </div>
                       )}
                       
                       <div className="flex items-start gap-5">
                          <div className={`p-4 rounded-2xl transition-all ${isEnabled ? 'bg-emerald-500 text-white' : 'bg-slate-100 dark:bg-white/5 text-slate-400'}`}>
                             <Icon className="w-6 h-6" />
                          </div>
                          <div className="flex-1 pr-10">
                             <h4 className="font-black text-slate-800 dark:text-white mb-1">{meta.label}</h4>
                             <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">{meta.description}</p>
                          </div>
                          <div className="flex-shrink-0 self-center">
                             {isEnabled ? (
                               <ToggleRight className="w-10 h-10 text-emerald-500" />
                             ) : (
                               <ToggleLeft className="w-10 h-10 text-slate-300 dark:text-slate-700" />
                             )}
                          </div>
                       </div>
                     </div>
                   );
                 })}
               </div>

               {/* Information Note */}
               <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-2xl p-6 flex gap-4 items-start">
                  <div className="p-2 bg-indigo-500 text-white rounded-lg shadow-lg">
                    <Info className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-bold text-indigo-700 dark:text-indigo-400 text-sm mb-1">Nota de Seguridad</h4>
                    <p className="text-xs text-indigo-600 dark:text-indigo-500 leading-relaxed">
                      Activar una funcionalidad aquí le otorga acceso al tenant incluso si su plan actual no la incluye. 
                      Asegúrate de que este cambio esté alineado con acuerdos comerciales especiales o pruebas beta autorizadas. 
                      Todas las activaciones quedan registradas en el Log Forense.
                    </p>
                  </div>
               </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
