import React, { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { read, utils } from "xlsx";
import { Campaign, MessageTemplate } from "../types";
import { marketingService } from "../services/marketingService";
import { API_BASE_URL } from "../services/apiConfig";
import {
  Megaphone,
  Layout,
  History,
  Plus,
  Send,
  Calendar,
  Zap,
  Filter,
  Search,
  ChevronRight,
  ArrowLeft,
  Smartphone,
  Monitor,
  Moon,
  Sun,
  MoreVertical,
  Trash2,
  Edit2,
  FileText,
  Mail,
  Smartphone as SmsIcon,
  MessageSquare,
  Image as ImageIcon,
  CheckCircle2,
  Settings,
  AlertCircle,
  Eye,
  Rocket,
} from "lucide-react";
import { ModuleHeader } from "./common/ModuleHeader";
import { MediaLibrary } from "./MediaLibrary";

export const MarketingDashboard: React.FC = () => {
  // TABS & STATE
  const [activeSection, setActiveSection] = useState<
    "builder" | "history" | "templates"
  >("builder");
  const [builderStep, setBuilderStep] = useState<number>(1);

  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [tags, setTags] = useState<
    Array<{ id: string; name: string; color: string }>
  >([]);
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);

  // HISTORY FILTERS STATE
  const [historyFilter, setHistoryFilter] = useState("all");
  const [historySearch, setHistorySearch] = useState("");
  const [historySort, setHistorySort] = useState<"newest" | "oldest">("newest");

  // CAMPAIGN FORM STATE
  const [campaignName, setCampaignName] = useState("");
  const [selectedChannel, setSelectedChannel] = useState<
    "WHATSAPP" | "EMAIL" | "SMS"
  >("WHATSAPP");
  const [emailSubject, setEmailSubject] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [templateVariables, setTemplateVariables] = useState<
    Record<string, string>
  >({});
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [targetPhones, setTargetPhones] = useState<string[]>([]);
  const [excelFileName, setExcelFileName] = useState<string>("");
  const [audienceCount, setAudienceCount] = useState(0);

  // TEMPLATE MANAGER STATE
  const [newTemplate, setNewTemplate] = useState({
    id: "" as string | undefined,
    name: "",
    content: "",
    category: "MARKETING" as "MARKETING" | "UTILITY" | "AUTHENTICATION",
    subject: "", // Email Subject
    preheader: "", // Email Preheader (Preview text)
  });
  const [isCreatingTemplate, setIsCreatingTemplate] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);
  const [showMediaLibrary, setShowMediaLibrary] = useState(false);
  const [previewDevice, setPreviewDevice] = useState<"mobile" | "desktop">(
    "mobile",
  );
  const [previewDarkMode, setPreviewDarkMode] = useState(false);
  const [showCodeEditor, setShowCodeEditor] = useState(false);
  const [generationStatus, setGenerationStatus] = useState("");

  // UX UTILS
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const [historyStack, setHistoryStack] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [showEmailSettings, setShowEmailSettings] = useState(false);

  // UX LOGIC HELPERS
  const addToHistory = (content: string) => {
    if (historyIndex >= 0 && historyStack[historyIndex] === content) return;
    const newStack = historyStack.slice(0, historyIndex + 1);
    newStack.push(content);
    if (newStack.length > 50) newStack.shift();
    setHistoryStack(newStack);
    setHistoryIndex(newStack.length - 1);
  };

  const manualUndo = () => {
    if (historyIndex > 0) {
      const prev = historyStack[historyIndex - 1];
      setNewTemplate((t) => ({ ...t, content: prev }));
      setHistoryIndex(historyIndex - 1);
    } else {
      toast.info("Nada más que deshacer");
    }
  };

  const manualRedo = () => {
    if (historyIndex < historyStack.length - 1) {
      const next = historyStack[historyIndex + 1];
      setNewTemplate((t) => ({ ...t, content: next }));
      setHistoryIndex(historyIndex + 1);
    } else {
      toast.info("Nada más que rehacer");
    }
  };

  // Auto-save history
  useEffect(() => {
    const timer = setTimeout(() => {
      if (newTemplate.content) addToHistory(newTemplate.content);
    }, 800);
    return () => clearTimeout(timer);
  }, [newTemplate.content]);

  const insertVariable = (varName: string) => {
    const tag = `{{${varName}}}`;
    if (showCodeEditor && editorRef.current) {
      const textarea = editorRef.current;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const text = newTemplate.content;
      const newText = text.substring(0, start) + tag + text.substring(end);
      setNewTemplate((prev) => ({ ...prev, content: newText }));

      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(start + tag.length, start + tag.length);
      }, 0);
      toast.success("Variable insertada");
    } else {
      navigator.clipboard.writeText(tag);
      toast.info("Copiado: " + tag);
    }
  };

  // ADVANCED CONFIG STATE
  const [scheduleMode, setScheduleMode] = useState<"now" | "later">("now");
  const [scheduledDate, setScheduledDate] = useState<string>("");
  const [editingCampaignId, setEditingCampaignId] = useState<string | null>(
    null,
  );
  const [config, setConfig] = useState({
    messagesPerMinute: 30,
    randomizeDelay: true,
  });

  const [isSending, setIsSending] = useState(false);

  // Load data from backend
  const loadData = async () => {
    try {
      const token = localStorage.getItem("token");
      if (!token) return;

      // Load campaigns
      const campaignsData = await marketingService.getCampaigns();
      setCampaigns(campaignsData);

      // Load Tags
      const tagsRes = await fetch(`${API_BASE_URL}/tags`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (tagsRes.ok) {
        const tagsData = await tagsRes.json();
        setTags(tagsData);
      }

      // Load Templates
      const tplRes = await fetch(`${API_BASE_URL}/templates`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (tplRes.ok) {
        const tplData = await tplRes.json();
        setTemplates(tplData.data?.templates || []);
      }
    } catch (error) {
      console.error("Error loading data:", error);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Effects
  useEffect(() => {
    // Calculate audience count based on selected tags' real counts
    const totalCount = selectedTags.reduce((acc, tagId) => {
      const tag = tags.find((t) => t.id === tagId);
      return acc + (tag ? (tag as any).count || 0 : 0);
    }, 0);
    setAudienceCount(totalCount + targetPhones.length);
  }, [selectedTags, tags, targetPhones]);

  const toggleTag = (tagId: string) => {
    setSelectedTags((prev) =>
      prev.includes(tagId) ? prev.filter((t) => t !== tagId) : [...prev, tagId],
    );
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setExcelFileName(file.name);
    const data = await file.arrayBuffer();
    const workbook = read(data);
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const jsonData = utils.sheet_to_json(worksheet, { header: 1 });

    const phones: string[] = [];
    jsonData.forEach((row: any) => {
      if (row[0]) {
        const phone = String(row[0]).replace(/\D/g, ""); // Keep only digits
        if (phone.length >= 7) {
          // Basic validation
          phones.push(phone);
        }
      }
    });

    setTargetPhones(phones);
  };

  const getSelectedTemplate = () =>
    templates.find((t) => t.id === selectedTemplateId);

  const handleTemplateChange = (tplId: string) => {
    setSelectedTemplateId(tplId);
    setTemplateVariables({});
  };

  const handleCreateTemplate = async () => {
    if (!newTemplate.name || !newTemplate.content) return;
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_BASE_URL}/templates`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: newTemplate.name,
          category: newTemplate.category,
          language: "es",
          components: [{ type: "BODY", text: newTemplate.content }],
        }),
      });

      if (res.ok) {
        setNewTemplate({
          id: "",
          name: "",
          content: "",
          category: "MARKETING",
          subject: "",
          preheader: "",
        });
        setIsCreatingTemplate(false);
        loadData(); // Reload templates
        toast.success("Plantilla creada con éxito");
      }
    } catch (e) {
      console.error(e);
      toast.error("Error al crear plantilla");
    }
  };

  const handleDeleteTemplate = async (id: string) => {
    if (!confirm("¿Eliminar plantilla?")) return;
    try {
      const token = localStorage.getItem("token");
      await fetch(`${API_BASE_URL}/templates/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      loadData();
    } catch (e) {
      console.error(e);
    }
  };

  const handleEditCampaign = (campaign: Campaign) => {
    setEditingCampaignId(campaign.id);
    setEditingCampaignId(campaign.id);
    setCampaignName(campaign.name);
    setSelectedChannel(campaign.channel || "WHATSAPP");
    setEmailSubject(campaign.subject || "");
    setSelectedTemplateId(campaign.templateId || "");
    setSelectedTemplateId(campaign.templateId || "");
    setSelectedTags(campaign.targetTags || []);

    const configPhones = (campaign.config as any)?.targetPhones || [];
    setTargetPhones(configPhones);
    setExcelFileName(
      configPhones.length > 0
        ? `${configPhones.length} números importados`
        : "",
    );

    if (campaign.config?.scheduledAt) {
      setScheduleMode("later");
      // Format date for datetime-local input (YYYY-MM-DDTHH:mm)
      const date = new Date(campaign.config.scheduledAt);
      const formatted = date.toISOString().slice(0, 16);
      setScheduledDate(formatted);
    } else {
      setScheduleMode("now");
      setScheduledDate("");
    }

    setConfig({
      messagesPerMinute: campaign.config?.messagesPerMinute || 30,
      randomizeDelay: campaign.config?.randomizeDelay || true,
    });

    setActiveSection("builder");
    setBuilderStep(1);
  };

  const handleDeleteCampaign = async (id: string) => {
    if (!confirm("¿Estás seguro de eliminar esta campaña?")) return;
    try {
      await marketingService.deleteCampaign(id);
      setCampaigns((prev) => prev.filter((c) => c.id !== id));
      toast.success("Campaña eliminada correctamente");
    } catch (error) {
      console.error("Error deleting campaign:", error);
      toast.error("Error al eliminar la campaña");
    }
  };

  const handleLaunch = async () => {
    if (
      !campaignName ||
      !selectedTemplateId ||
      (selectedTags.length === 0 && targetPhones.length === 0)
    ) {
      toast.error(
        "Debes completar los campos requeridos y seleccionar al menos una etiqueta o subir destinatarios.",
      );
      return;
    }

    if (scheduleMode === "later" && !scheduledDate) {
      toast.error(
        "Por favor selecciona una fecha y hora para programar la campaña.",
      );
      return;
    }

    setIsSending(true);

    try {
      // Extract text from components JSON
      const template = getSelectedTemplate();
      let content = "";
      if (template && Array.isArray(template.components)) {
        const body = template.components.find((c: any) => c.type === "BODY");
        content = body?.text || "";
      }

      const finalConfig = {
        ...config,
        targetPhones: targetPhones,
        scheduledAt:
          scheduleMode === "later" && scheduledDate
            ? new Date(scheduledDate)
            : undefined,
      };

      if (editingCampaignId) {
        const updated = await marketingService.updateCampaign(
          editingCampaignId,
          {
            name: campaignName,
            messageContent: content,
            templateId: selectedTemplateId,
            targetTags: selectedTags,
            status: scheduleMode === "later" ? "scheduled" : "processing",
            config: finalConfig,
          },
        );
        setCampaigns((prev) =>
          prev.map((c) => (c.id === editingCampaignId ? updated : c)),
        );
        setEditingCampaignId(null);
      } else {
        const newCampaign = await marketingService.createCampaign({
          name: campaignName,
          messageContent: content,
          templateId: selectedTemplateId,
          targetTags: selectedTags,
          status: scheduleMode === "later" ? "scheduled" : "processing",
          config: finalConfig,
          channel: selectedChannel,
          subject: selectedChannel === "EMAIL" ? emailSubject : undefined,
        });
        setCampaigns([newCampaign, ...campaigns]);
      }

      setIsSending(false);
      setActiveSection("history");

      setBuilderStep(1);
      setCampaignName("");
      setSelectedChannel("WHATSAPP");
      setEmailSubject("");
      setSelectedTags([]);
      setTargetPhones([]);
      setExcelFileName("");
      setSelectedTemplateId("");
      setScheduledDate("");
      setScheduleMode("now");
      toast.success(
        editingCampaignId
          ? "Campaña actualizada correctamente"
          : "Campaña creada y lanzada correctamente",
      );
    } catch (error) {
      console.error("Error launching/updating campaign:", error);
      setIsSending(false);
      toast.error("Error al guardar la campaña");
    }
  };

  const filteredCampaigns = campaigns.filter((c) =>
    c.name.toLowerCase().includes(historySearch.toLowerCase()),
  );

  return (
    <div className="h-full flex flex-col bg-gray-50 dark:bg-[#0b141a] transition-colors duration-200">
      <ModuleHeader
        title="Marketing & Difusión"
        description="Gestión profesional de campañas masivas."
        icon={<Megaphone className="w-8 h-8 text-white" />}
        gradient="from-rose-600 to-red-600 dark:from-rose-800 dark:to-red-800"
        stats={{
          label: "Total Campañas",
          value: campaigns.length,
        }}
      />

      {/* PREMIUM TAB NAVIGATION */}
      <div className="sticky top-0 z-30 bg-white/80 dark:bg-[#111b21]/80 backdrop-blur-xl border-b border-gray-100 dark:border-gray-800 px-4 py-3">
        <div className="max-w-md mx-auto flex bg-gray-100/50 dark:bg-gray-800/50 p-1 rounded-2xl border border-gray-200/50 dark:border-gray-700/50">
          <button
            onClick={() => setActiveSection("builder")}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
              activeSection === "builder"
                ? "bg-white dark:bg-[#202c33] shadow-lg shadow-gray-200/50 dark:shadow-none text-rose-600 dark:text-rose-400"
                : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
            }`}
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Crear</span>
          </button>
          <button
            onClick={() => setActiveSection("templates")}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
              activeSection === "templates"
                ? "bg-white dark:bg-[#202c33] shadow-lg shadow-gray-200/50 dark:shadow-none text-rose-600 dark:text-rose-400"
                : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
            }`}
          >
            <Layout className="w-4 h-4" />
            <span className="hidden sm:inline">Plantillas</span>
          </button>
          <button
            onClick={() => setActiveSection("history")}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
              activeSection === "history"
                ? "bg-white dark:bg-[#202c33] shadow-lg shadow-gray-200/50 dark:shadow-none text-rose-600 dark:text-rose-400"
                : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
            }`}
          >
            <History className="w-4 h-4" />
            <span className="hidden sm:inline">Historial</span>
          </button>
        </div>
      </div>

      <div className="p-4 md:p-8 flex-1 overflow-hidden">
        {activeSection === "builder" && (
          <div className="flex flex-col lg:flex-row h-full gap-8 overflow-y-auto lg:overflow-hidden lg:pb-10">
            {/* FORM AREA */}
            <div className="flex-1 lg:w-2/3 bg-white dark:bg-[#1c272f] rounded-[2.5rem] shadow-xl shadow-gray-200/50 dark:shadow-none border border-gray-100 dark:border-gray-800 flex flex-col overflow-hidden">
              {/* STEPS HEADER */}
              <div className="flex border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/20">
                {[1, 2, 3].map((step) => (
                  <div
                    key={step}
                    className={`flex-1 py-6 text-center text-[10px] font-black uppercase tracking-[0.2em] border-b-2 transition-all ${
                      builderStep === step
                        ? "border-rose-500 text-rose-500 bg-white dark:bg-[#1c272f]"
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
                {builderStep === 1 && (
                  <div className="space-y-8 animate-fade-in">
                    <div className="group">
                      <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 group-focus-within:text-rose-500 transition-colors">
                        Nombre de Campaña
                      </label>
                      <input
                        type="text"
                        value={campaignName}
                        onChange={(e) => setCampaignName(e.target.value)}
                        className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl px-6 py-4 focus:ring-4 focus:ring-rose-500/10 focus:border-rose-500 transition-all outline-none font-medium text-gray-900 dark:text-white"
                        placeholder="Ej: Promo Verano 2024"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">
                        Canal de Difusión
                      </label>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <button
                          onClick={() => setSelectedChannel("WHATSAPP")}
                          className={`flex items-center justify-center gap-3 py-4 rounded-2xl font-black text-xs uppercase tracking-widest transition-all ${
                            selectedChannel === "WHATSAPP"
                              ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/20"
                              : "bg-gray-50 dark:bg-gray-900 text-gray-500 border border-gray-100 dark:border-gray-800 hover:bg-gray-100"
                          }`}
                        >
                          <MessageSquare className="w-4 h-4" /> WhatsApp
                        </button>
                        <button
                          onClick={() => setSelectedChannel("EMAIL")}
                          className={`flex items-center justify-center gap-3 py-4 rounded-2xl font-black text-xs uppercase tracking-widest transition-all ${
                            selectedChannel === "EMAIL"
                              ? "bg-blue-500 text-white shadow-lg shadow-blue-500/20"
                              : "bg-gray-50 dark:bg-gray-900 text-gray-500 border border-gray-100 dark:border-gray-800 hover:bg-gray-100"
                          }`}
                        >
                          <Mail className="w-4 h-4" /> Email
                        </button>
                        <button
                          onClick={() => setSelectedChannel("SMS")}
                          className={`flex items-center justify-center gap-3 py-4 rounded-2xl font-black text-xs uppercase tracking-widest transition-all ${
                            selectedChannel === "SMS"
                              ? "bg-rose-500 text-white shadow-lg shadow-rose-500/20"
                              : "bg-gray-50 dark:bg-gray-900 text-gray-500 border border-gray-100 dark:border-gray-800 hover:bg-gray-100"
                          }`}
                        >
                          <SmsIcon className="w-4 h-4" /> SMS
                        </button>
                      </div>
                    </div>

                    {selectedChannel === "EMAIL" && (
                      <div className="animate-fade-in-down group">
                        <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 group-focus-within:text-blue-500 transition-colors">
                          Asunto del Correo
                        </label>
                        <input
                          type="text"
                          value={emailSubject}
                          onChange={(e) => setEmailSubject(e.target.value)}
                          className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl px-6 py-4 focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all outline-none font-medium text-gray-900 dark:text-white"
                          placeholder="¡Oferta Especial para ti!"
                        />
                      </div>
                    )}

                    <div className="group">
                      <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 group-focus-within:text-rose-500 transition-colors">
                        Seleccionar Plantilla
                      </label>
                      <div className="relative">
                        <select
                          value={selectedTemplateId}
                          onChange={(e) => handleTemplateChange(e.target.value)}
                          className="w-full appearance-none bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl px-6 py-4 focus:ring-4 focus:ring-rose-500/10 focus:border-rose-500 transition-all outline-none font-medium text-gray-900 dark:text-white cursor-pointer"
                        >
                          <option value="">-- Seleccionar Template --</option>
                          {templates.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.name}
                            </option>
                          ))}
                        </select>
                        <ChevronRight className="w-5 h-5 absolute right-6 top-1/2 transform -translate-y-1/2 rotate-90 text-gray-400 pointer-events-none" />
                      </div>
                    </div>
                  </div>
                )}

                {builderStep === 2 && (
                  <div className="space-y-8 animate-fade-in">
                    <div>
                      <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-6">
                        Segmentación por Etiquetas
                      </label>
                      <div className="flex flex-wrap gap-3">
                        {tags.map((tag) => (
                          <button
                            key={tag.id}
                            onClick={() => toggleTag(tag.id)}
                            className={`px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest border transition-all ${
                              selectedTags.includes(tag.id)
                                ? `${tag.color} ring-4 ring-rose-500/10 border-rose-500 shadow-lg`
                                : "bg-gray-50 dark:bg-gray-800 text-gray-400 border-gray-100 dark:border-gray-800"
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
                        <div className="text-5xl font-black text-rose-600 dark:text-rose-400 mb-2 tracking-tighter">
                          {audienceCount}
                        </div>
                        <div className="text-[10px] font-black text-gray-500 uppercase tracking-widest">
                          Contactos Estimados en Audiencia
                        </div>
                      </div>
                    </div>

                    <div className="pt-8 border-t border-gray-100 dark:border-gray-800">
                      <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">
                        📤 Importar desde Base de Datos Externa (Excel)
                      </label>
                      <div className="flex flex-col sm:flex-row gap-4 items-center">
                        <label className="w-full sm:w-auto cursor-pointer bg-white dark:bg-gray-800 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-2xl px-10 py-6 text-center hover:border-rose-500 transition-all flex flex-col items-center gap-2 group">
                          <Plus className="w-6 h-6 text-gray-300 group-hover:text-rose-500 transition-colors" />
                          <span className="text-[10px] font-black uppercase tracking-widest text-gray-500 group-hover:text-rose-500">
                            Cargar Archivo
                          </span>
                          <input
                            type="file"
                            accept=".xlsx, .xls, .csv"
                            onChange={handleFileUpload}
                            className="hidden"
                          />
                        </label>
                        {excelFileName && (
                          <div className="bg-emerald-50 dark:bg-emerald-500/10 p-4 rounded-2xl border border-emerald-100 dark:border-emerald-500/20 flex items-center gap-3">
                            <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                            <div>
                              <p className="text-xs font-black text-emerald-700 dark:text-emerald-400 uppercase tracking-widest">
                                {excelFileName}
                              </p>
                              <p className="text-[10px] text-emerald-600 dark:text-emerald-500">
                                {targetPhones.length} números importados
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {builderStep === 3 && (
                  <div className="space-y-8 animate-fade-in">
                    <div className="bg-gray-50/50 dark:bg-gray-900/50 p-8 rounded-[2rem] border border-gray-100 dark:border-gray-800">
                      <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-6 flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-rose-500" /> 🗓️
                        Programación de Campaña
                      </h4>
                      <div className="grid grid-cols-2 gap-4 mb-6">
                        <button
                          onClick={() => setScheduleMode("now")}
                          className={`py-4 rounded-2xl font-black text-xs uppercase tracking-widest transition-all ${
                            scheduleMode === "now"
                              ? "bg-gray-900 dark:bg-white text-white dark:text-black shadow-xl"
                              : "bg-white dark:bg-gray-800 text-gray-500 border border-gray-100 dark:border-gray-800"
                          }`}
                        >
                          Lanzar Ahora
                        </button>
                        <button
                          onClick={() => setScheduleMode("later")}
                          className={`py-4 rounded-2xl font-black text-xs uppercase tracking-widest transition-all ${
                            scheduleMode === "later"
                              ? "bg-gray-900 dark:bg-white text-white dark:text-black shadow-xl"
                              : "bg-white dark:bg-gray-800 text-gray-500 border border-gray-100 dark:border-gray-800"
                          }`}
                        >
                          Programar
                        </button>
                      </div>

                      {scheduleMode === "later" && (
                        <div className="animate-fade-in-down">
                          <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">
                            Fecha y Hora de Inicio
                          </label>
                          <input
                            type="datetime-local"
                            value={scheduledDate}
                            onChange={(e) => setScheduledDate(e.target.value)}
                            className="w-full bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl px-6 py-4 focus:ring-4 focus:ring-rose-500/10 focus:border-rose-500 transition-all outline-none font-medium text-gray-900 dark:text-white"
                          />
                        </div>
                      )}
                    </div>

                    <div className="bg-gray-50/50 dark:bg-gray-900/50 p-8 rounded-[2rem] border border-gray-100 dark:border-gray-800">
                      <div className="flex justify-between items-center mb-6">
                        <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                          <Zap className="w-4 h-4 text-amber-500" /> 🛡️
                          Velocidad y Anti-Spam
                        </h4>
                        <span className="text-xs font-black text-rose-500 bg-rose-50 dark:bg-rose-500/10 px-3 py-1 rounded-full">
                          {config.messagesPerMinute} msgs/min
                        </span>
                      </div>
                      <input
                        type="range"
                        min="1"
                        max="120"
                        step="1"
                        value={config.messagesPerMinute}
                        onChange={(e) =>
                          setConfig({
                            ...config,
                            messagesPerMinute: Number(e.target.value),
                          })
                        }
                        className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-rose-500"
                      />
                      <div className="flex justify-between text-[10px] font-black text-gray-400 uppercase tracking-widest mt-4">
                        <span>Lento (Seguro)</span>
                        <span>Rápido (Agresivo)</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="p-8 border-t border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/10 flex justify-between">
                {builderStep > 1 ? (
                  <button
                    onClick={() => setBuilderStep(builderStep - 1)}
                    className="px-8 py-4 rounded-[1.25rem] border border-gray-100 dark:border-gray-800 font-black text-[10px] uppercase tracking-widest text-gray-500 hover:bg-gray-100 transition-all active:scale-95"
                  >
                    Regresar
                  </button>
                ) : (
                  <div />
                )}
                {builderStep < 3 ? (
                  <button
                    onClick={() => setBuilderStep(builderStep + 1)}
                    disabled={
                      builderStep === 1 &&
                      (!selectedTemplateId || !campaignName)
                    }
                    className="px-10 py-4 bg-gray-900 dark:bg-white text-white dark:text-black rounded-[1.25rem] font-black text-[10px] uppercase tracking-widest shadow-xl transition-all hover:scale-105 active:scale-95 disabled:opacity-30 disabled:hover:scale-100"
                  >
                    Siguiente Paso
                  </button>
                ) : (
                  <button
                    onClick={handleLaunch}
                    disabled={isSending || audienceCount === 0}
                    className="px-10 py-4 bg-rose-600 hover:bg-rose-700 text-white rounded-[1.25rem] font-black text-[10px] uppercase tracking-widest shadow-xl shadow-rose-600/20 transition-all hover:scale-105 active:scale-95 disabled:opacity-30 flex items-center gap-3"
                  >
                    {isSending ? (
                      <Zap className="w-4 h-4 animate-spin" />
                    ) : (
                      <Rocket className="w-4 h-4" />
                    )}
                    {isSending
                      ? "Procesando..."
                      : editingCampaignId
                        ? "Guardar Cambios"
                        : "Lanzar Campaña"}
                  </button>
                )}
              </div>
            </div>

            {/* PREVIEW PANEL (HIDDEN ON MOBILE IN BUILDER FOR BETTER FOCUS) */}
            <div className="hidden lg:flex lg:w-1/3 flex-col bg-[#e5ddd5] dark:bg-[#070b0e] rounded-[3rem] border border-gray-100 dark:border-gray-800 relative overflow-hidden shadow-inner">
              <div
                className="absolute inset-0 opacity-[0.03]"
                style={{
                  backgroundImage:
                    'url("https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png")',
                }}
              ></div>
              <div className="z-10 w-full px-8 py-20 flex flex-col items-center">
                <div className="text-[10px] font-black text-gray-500 uppercase tracking-[0.3em] mb-10 opacity-30">
                  Previsualización Real
                </div>

                <div className="w-full max-w-[300px] bg-white dark:bg-[#202c33] rounded-3xl shadow-2xl p-4 relative group">
                  <div className="absolute top-0 left-0 w-full h-1.5 bg-rose-500 rounded-t-3xl shadow-sm shadow-rose-500/50"></div>
                  {selectedTemplateId ? (
                    <div className="text-xs text-gray-800 dark:text-gray-200 whitespace-pre-wrap leading-relaxed py-4 font-medium">
                      {(() => {
                        const t = getSelectedTemplate();
                        if (!t) return "Error cargando plantilla";
                        const body = Array.isArray(t.components)
                          ? t.components.find((c: any) => c.type === "BODY")
                          : null;
                        return body ? body.text : "Sin contenido";
                      })()}
                    </div>
                  ) : (
                    <div className="text-center text-gray-300 py-16 italic text-[10px] font-medium animate-pulse uppercase tracking-widest">
                      Selecciona una plantilla
                    </div>
                  )}
                  <div className="flex justify-end pr-2">
                    <div className="text-[9px] font-black text-gray-400 opacity-50 uppercase tracking-tighter">
                      {new Date().toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeSection === "templates" && (
          <div className="flex flex-col h-full gap-6 animate-fade-in">
            {/* TEMPLATE GRID HEADER */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white/50 dark:bg-gray-800/10 p-6 rounded-[2rem] border border-gray-100 dark:border-gray-800 backdrop-blur-md shadow-sm">
              <div>
                <h3 className="text-2xl font-black text-gray-900 dark:text-white tracking-tight flex items-center gap-3">
                  <Layout className="w-6 h-6 text-rose-500" /> Plantillas de
                  Diseño
                </h3>
                <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mt-1">
                  Gestiona y reutiliza tus mejores comunicaciones
                </p>
              </div>
              <button
                onClick={() => setIsCreatingTemplate(true)}
                className="w-full md:w-auto px-8 py-4 bg-gray-900 dark:bg-white text-white dark:text-black rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl transition-all hover:scale-105 active:scale-95 flex items-center justify-center gap-3"
              >
                <Plus className="w-4 h-4" /> Nueva Plantilla
              </button>
            </div>

            {/* TEMPLATE LIST */}
            {templates.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-12 bg-white dark:bg-[#1c272f] rounded-[3rem] border border-dashed border-gray-200 dark:border-gray-800 shadow-inner">
                <div className="w-32 h-32 bg-gray-50 dark:bg-gray-800/50 rounded-full flex items-center justify-center mb-8 animate-pulse text-5xl">
                  🎨
                </div>
                <h4 className="text-xl font-black text-gray-900 dark:text-white mb-2">
                  Tu Galería está Vacía
                </h4>
                <p className="text-sm text-gray-500 max-w-xs uppercase tracking-widest font-bold leading-relaxed">
                  Crea tu primer diseño profesional para empezar a impactar
                </p>
              </div>
            ) : (
              <div className="overflow-y-auto flex-1 custom-scrollbar pb-10">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {templates.map((t) => {
                    const bodyContent = Array.isArray(t.components)
                      ? t.components.find((c: any) => c.type === "BODY")
                          ?.text || ""
                      : "";
                    const isHtml = /<[a-z][\s\S]*>/i.test(bodyContent);

                    return (
                      <div
                        key={t.id}
                        className="group relative bg-white dark:bg-[#1c272f] border border-gray-100 dark:border-gray-800 rounded-[2.5rem] overflow-hidden hover:shadow-2xl hover:shadow-rose-500/10 transition-all duration-500 flex flex-col h-[380px]"
                      >
                        {/* Preview Area */}
                        <div className="h-2/3 bg-gray-50 dark:bg-[#0b141a] overflow-hidden relative border-b border-gray-50 dark:border-gray-800">
                          {isHtml ? (
                            <div className="w-[300%] h-[300%] transform scale-[0.33] origin-top-left pointer-events-none p-10 bg-white">
                              <div
                                dangerouslySetInnerHTML={{
                                  __html: bodyContent,
                                }}
                              />
                            </div>
                          ) : (
                            <div className="p-8 text-[11px] text-gray-400 dark:text-gray-500 whitespace-pre-wrap font-mono leading-relaxed italic">
                              {bodyContent.slice(0, 400)}
                              {bodyContent.length > 400 && "..."}
                            </div>
                          )}

                          {/* Hover Actions Overlay */}
                          <div className="absolute inset-0 bg-gray-900/40 dark:bg-black/60 opacity-0 group-hover:opacity-100 transition-all duration-300 flex flex-col items-center justify-center gap-4 backdrop-blur-[2px]">
                            <button
                              onClick={() => {
                                setSelectedTemplateId(t.id);
                                setActiveSection("builder");
                                toast.success("Plantilla cargada");
                              }}
                              className="px-8 py-3 bg-white text-black rounded-xl font-black text-[10px] uppercase tracking-widest hover:scale-110 transition-transform shadow-xl"
                            >
                              Seleccionar
                            </button>
                            <div className="flex gap-2">
                              <button
                                onClick={() => {
                                  setNewTemplate({
                                    id: t.id,
                                    name: t.name,
                                    category: t.category,
                                    content: bodyContent,
                                    subject: t.subject || "",
                                    preheader: "", // Default empty preheader
                                  });
                                  setIsCreatingTemplate(true);
                                }}
                                className="p-3 bg-white/20 hover:bg-white/40 text-white rounded-xl backdrop-blur-md transition-all"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleDeleteTemplate(t.id)}
                                className="p-3 bg-rose-500/80 hover:bg-rose-600 text-white rounded-xl backdrop-blur-md transition-all shadow-lg"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        </div>

                        {/* Footer Info */}
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
                            <h4 className="font-black text-gray-900 dark:text-white truncate text-sm">
                              {t.name}
                            </h4>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
        {/* CREATE TEMPLATE FORM */}
        {/* ENTERPRISE TEMPLATE BUILDER */}
        {isCreatingTemplate && (
          <div className="fixed inset-0 z-[100] bg-[#f8f9fa] dark:bg-[#0b141a] flex flex-col animate-fade-in font-sans">
            {/* 1. TOP TOOLBAR */}
            <div className="h-16 px-6 bg-white dark:bg-[#202c33] border-b border-gray-200 dark:border-gray-700 flex justify-between items-center shadow-sm z-30 relative">
              <div className="flex items-center gap-4">
                <button
                  onClick={() => setIsCreatingTemplate(false)}
                  className="p-2 -ml-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 transition-colors"
                >
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M10 19l-7-7m0 0l7-7m-7 7h18"
                    />
                  </svg>
                </button>
                <div className="flex flex-col">
                  <input
                    type="text"
                    value={newTemplate.name}
                    onChange={(e) =>
                      setNewTemplate({
                        ...newTemplate,
                        name: e.target.value,
                      })
                    }
                    placeholder="Nueva Plantilla Sin Título"
                    className="font-bold text-gray-800 dark:text-white bg-transparent outline-none placeholder-gray-400 w-64"
                  />
                  <div className="flex items-center gap-2 text-xs text-gray-400">
                    <span className="uppercase tracking-wider font-semibold">
                      {newTemplate.category}
                    </span>
                    <span>•</span>
                    <span>{newTemplate.content?.length || 0} caracteres</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                {/* UNDO/REDO */}
                <div className="flex bg-gray-100 dark:bg-gray-800 rounded-lg p-1 border border-gray-200 dark:border-gray-700 mr-2">
                  <button
                    onClick={manualUndo}
                    disabled={historyIndex <= 0}
                    className="p-2 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 disabled:opacity-30 transition-colors"
                    title="Deshacer"
                  >
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
                        d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"
                      />
                    </svg>
                  </button>
                  <button
                    onClick={manualRedo}
                    disabled={historyIndex >= historyStack.length - 1}
                    className="p-2 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 disabled:opacity-30 transition-colors"
                    title="Rehacer"
                  >
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
                        d="M21 10h-10a8 8 0 00-8 8v2M21 10l-6 6m6-6l-6-6"
                      />
                    </svg>
                  </button>
                </div>

                {/* META SETTINGS */}
                <button
                  onClick={() => setShowEmailSettings(!showEmailSettings)}
                  className={`p-2 rounded-lg border transition-all ${showEmailSettings ? "bg-indigo-50 border-indigo-200 text-indigo-600" : "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-600 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"}`}
                  title="Configuración de Envío"
                >
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                  </svg>
                </button>

                <div className="h-8 w-px bg-gray-200 dark:bg-gray-700 mx-2"></div>

                {/* Device Toggles */}
                <div className="flex bg-gray-100 dark:bg-gray-800 rounded-lg p-1 border border-gray-200 dark:border-gray-700">
                  <button
                    onClick={() => setPreviewDevice("desktop")}
                    className={`p-2 rounded-md transition-all ${previewDevice === "desktop" ? "bg-white dark:bg-gray-600 shadow-sm text-indigo-600" : "text-gray-400 hover:text-gray-600"}`}
                  >
                    <svg
                      className="w-5 h-5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                      />
                    </svg>
                  </button>
                  <button
                    onClick={() => setPreviewDevice("mobile")}
                    className={`p-2 rounded-md transition-all ${previewDevice === "mobile" ? "bg-white dark:bg-gray-600 shadow-sm text-indigo-600" : "text-gray-400 hover:text-gray-600"}`}
                  >
                    <svg
                      className="w-5 h-5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z"
                      />
                    </svg>
                  </button>
                </div>

                {/* Dark Mode Preview Toggle */}
                <button
                  onClick={() => setPreviewDarkMode(!previewDarkMode)}
                  className={`p-2 rounded-lg border transition-all ${previewDarkMode ? "bg-gray-800 border-gray-700 text-yellow-400" : "bg-white border-gray-200 text-gray-400"}`}
                  title="Simular Modo Oscuro"
                >
                  {previewDarkMode ? (
                    <svg
                      className="w-5 h-5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
                      />
                    </svg>
                  ) : (
                    <svg
                      className="w-5 h-5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
                      />
                    </svg>
                  )}
                </button>

                <div className="h-8 w-px bg-gray-200 dark:bg-gray-700 mx-2"></div>

                <button
                  onClick={() =>
                    toast.success(
                      "Prueba de envío simulada a " +
                        (localStorage.getItem("userEmail") || "tu correo"),
                    )
                  }
                  className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-bold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                  Enviar Test
                </button>

                <button
                  onClick={handleCreateTemplate}
                  disabled={!newTemplate.name || !newTemplate.content}
                  className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold shadow-lg shadow-indigo-500/30 disabled:opacity-50 disabled:shadow-none transition-all flex items-center gap-2"
                >
                  <span>Guardar</span>
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
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                </button>
              </div>

              {/* SETTINGS POPUP */}
              {showEmailSettings && (
                <div className="absolute top-16 right-20 w-80 bg-white dark:bg-[#202c33] shadow-xl rounded-xl p-6 z-50 border border-gray-200 dark:border-gray-700 animate-fade-in-down">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="font-bold text-gray-800 dark:text-white text-sm flex items-center gap-2">
                      <span>📧</span> Configuración del Correo
                    </h3>
                    <button
                      onClick={() => setShowEmailSettings(false)}
                      className="text-gray-400 hover:text-gray-600"
                    >
                      ✕
                    </button>
                  </div>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-gray-500 uppercase mb-1">
                        Subject Line (Asunto)
                      </label>
                      <input
                        value={newTemplate.subject}
                        onChange={(e) =>
                          setNewTemplate({
                            ...newTemplate,
                            subject: e.target.value,
                          })
                        }
                        className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-gray-50 dark:bg-[#111b21] dark:text-white focus:ring-2 ring-indigo-500 outline-none"
                        placeholder="Ej: ¡Bienvenido a nuestra comunidad!"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-500 uppercase mb-1">
                        Preheader (Texto Previo)
                      </label>
                      <textarea
                        value={newTemplate.preheader}
                        onChange={(e) =>
                          setNewTemplate({
                            ...newTemplate,
                            preheader: e.target.value,
                          })
                        }
                        className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-gray-50 dark:bg-[#111b21] dark:text-white h-20 resize-none focus:ring-2 ring-indigo-500 outline-none"
                        placeholder="Texto visible en la bandeja de entrada antes de abrir el correo..."
                      />
                      <p className="text-[10px] text-gray-400 mt-1">
                        Este texto complementa el asunto para aumentar la tasa
                        de apertura.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* 2. MAIN WORKSPACE */}
            <div className="flex-1 flex overflow-hidden">
              {/* LEFT PANEL: PROMPT & TOOLS */}
              <div className="w-[420px] flex flex-col border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-[#111b21] z-20 shadow-lg relative">
                {/* TOP SECTION: SCROLLABLE */}
                <div
                  className={`flex flex-col transition-all duration-500 ease-in-out ${showCodeEditor ? "h-[45%]" : "h-full"} overflow-hidden`}
                >
                  {/* AI PROMPT */}
                  <div className="p-6 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-[#0b141a]/40 shrink-0">
                    <div className="flex justify-between items-center mb-3">
                      <label className="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-widest flex items-center gap-2">
                        <div className="w-6 h-6 rounded-lg bg-indigo-100 dark:bg-indigo-500/20 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                          ✨
                        </div>
                        <span>AI Copilot</span>
                      </label>
                      <div className="flex items-center gap-2 bg-gray-200 dark:bg-gray-800 rounded-full p-1 pl-3">
                        <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                          Dev Mode
                        </span>
                        <button
                          onClick={() => setShowCodeEditor(!showCodeEditor)}
                          className={`w-9 h-5 rounded-full transition-all duration-300 relative shadow-sm ${showCodeEditor ? "bg-indigo-500" : "bg-gray-400 dark:bg-gray-600"}`}
                        >
                          <div
                            className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all shadow-sm ${showCodeEditor ? "translate-x-4.5 left-0.5" : "left-0.5"}`}
                          ></div>
                        </button>
                      </div>
                    </div>

                    <div className="relative group">
                      <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/20 to-purple-500/20 rounded-xl blur opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                      <textarea
                        value={aiPrompt}
                        onChange={(e) => setAiPrompt(e.target.value)}
                        placeholder={
                          newTemplate.content
                            ? "Describe qué cambios quieres hacer..."
                            : "Describe tu email ideal para empezar..."
                        }
                        className="relative w-full border border-gray-200 dark:border-gray-700 rounded-xl p-4 pr-12 text-sm bg-white dark:bg-[#0b141a] shadow-sm text-gray-700 dark:text-gray-200 focus:ring-2 ring-indigo-500/50 outline-none resize-none h-32 transition-all placeholder-gray-400 dark:placeholder-gray-600"
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            if (aiPrompt && !isGeneratingAI) {
                              const btn =
                                document.getElementById("ai-generate-btn");
                              btn?.click();
                            }
                          }
                        }}
                      />
                      <button
                        id="ai-generate-btn"
                        onClick={async () => {
                          if (!aiPrompt) return;
                          setIsGeneratingAI(true);
                          setGenerationStatus(
                            "Analizando solicitud de diseño...",
                          );

                          setTimeout(
                            () =>
                              setGenerationStatus(
                                "Estructurando tablas responsive...",
                              ),
                            1500,
                          );
                          setTimeout(
                            () =>
                              setGenerationStatus(
                                "Optimizando estilos visuales...",
                              ),
                            3000,
                          );

                          try {
                            let userMessage = aiPrompt;
                            if (
                              newTemplate.content &&
                              newTemplate.content.length > 50
                            ) {
                              userMessage = `CÓDIGO HTML ACTUAL:\n${newTemplate.content}\n\nINSTRUCCIONES DE CAMBIO:\n${aiPrompt}`;
                            }

                            const res =
                              await marketingService.generateAITemplate(
                                userMessage,
                              );
                            const clean = res
                              .replace(/```html/g, "")
                              .replace(/```/g, "");
                            setNewTemplate((prev) => ({
                              ...prev,
                              content: clean,
                            }));
                            setAiPrompt("");
                            toast.success("Diseño actualizado");
                          } catch (e) {
                            console.error(e);
                            toast.error("Error en generación");
                          } finally {
                            setIsGeneratingAI(false);
                            setGenerationStatus("");
                          }
                        }}
                        disabled={isGeneratingAI || !aiPrompt}
                        className="absolute bottom-3 right-3 p-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg shadow-lg shadow-indigo-500/30 disabled:opacity-50 disabled:shadow-none transition-all hover:scale-105 active:scale-95 z-10"
                      >
                        {isGeneratingAI ? (
                          <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                          <svg
                            className="w-5 h-5"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M13 10V3L4 14h7v7l9-11h-7z"
                            />
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* TOOLS LIST */}
                  <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-thin scrollbar-thumb-gray-200 dark:scrollbar-thumb-gray-700">
                    {/* Status */}
                    {isGeneratingAI && (
                      <div className="flex items-center gap-3 p-3 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-800 rounded-xl animate-pulse">
                        <div className="w-2 h-2 bg-indigo-500 rounded-full animate-ping"></div>
                        <span className="text-xs font-bold text-indigo-700 dark:text-indigo-300 font-mono">
                          {generationStatus}
                        </span>
                      </div>
                    )}

                    {/* Variables */}
                    <div>
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3 block">
                        Bancos de Datos
                      </label>
                      <div className="flex flex-col gap-2">
                        <div className="relative group">
                          <select
                            className="w-full appearance-none border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-sm bg-gray-50 dark:bg-[#202c33] text-gray-700 dark:text-gray-200 outline-none hover:border-indigo-300 dark:hover:border-indigo-700 transition-colors cursor-pointer"
                            onChange={(e) => {
                              if (e.target.value) {
                                insertVariable(e.target.value);
                                e.target.value = "";
                              }
                            }}
                          >
                            <option value="">
                              Insertar Variable Dinámica...
                            </option>
                            <option value="contact.firstName">
                              👤 Nombre del Contacto
                            </option>
                            <option value="contact.company">🏢 Empresa</option>
                            <option value="agent.name">👨‍💼 Nombre Agente</option>
                          </select>
                          <div className="absolute right-4 top-3.5 pointer-events-none text-gray-400">
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
                                d="M19 9l-7 7-7-7"
                              />
                            </svg>
                          </div>
                        </div>

                        <button
                          onClick={() => {
                            const footer = `\n<!-- LEGAL FOOTER -->\n<table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-top: 40px; border-top: 1px solid #eee;"><tr><td align="center" style="padding: 20px; font-family: sans-serif; font-size: 11px; color: #888;"><p style="margin: 0;">&copy; 2024 {{company.name}}. Todos los derechos reservados.</p><p style="margin: 5px 0 0 0;">{{company.address}}</p><p style="margin: 10px 0 0 0;"><a href="{{unsubscribe_url}}" style="color: #666; text-decoration: underline;">Darse de baja</a></p></td></tr></table>`;
                            setNewTemplate((prev) => ({
                              ...prev,
                              content: prev.content + footer,
                            }));
                            toast.success("Footer Legal añadido");
                          }}
                          className="w-full border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-[#202c33] text-gray-600 dark:text-gray-300 text-xs font-bold rounded-xl px-4 py-3 transition-all flex items-center justify-between group"
                        >
                          <span className="flex items-center gap-2">
                            <span>⚖️</span> Footer Legal Anti-Spam
                          </span>
                          <span className="opacity-0 group-hover:opacity-100 transition-opacity">
                            →
                          </span>
                        </button>
                      </div>
                    </div>

                    {/* Media */}
                    <div>
                      <button
                        onClick={() => setShowMediaLibrary(true)}
                        className="w-full aspect-[3/1] border-2 border-dashed border-gray-200 dark:border-gray-700 hover:border-indigo-500/50 hover:bg-indigo-50/50 dark:hover:bg-indigo-900/10 rounded-xl flex flex-col items-center justify-center gap-2 text-sm text-gray-500 dark:text-gray-400 transition-all group"
                      >
                        <div className="p-2 bg-gray-100 dark:bg-gray-800 rounded-full group-hover:scale-110 transition-transform">
                          <svg
                            className="w-5 h-5"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                            />
                          </svg>
                        </div>
                        <span className="font-medium">
                          Abrir Galería Multimedia
                        </span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* BOTTOM SECTION: CODE EDITOR */}
                <div
                  className={`border-t border-gray-200 dark:border-gray-800 bg-[#1e1e1e] flex flex-col transition-all duration-500 ease-in-out ${showCodeEditor ? "flex-1" : "h-0 overflow-hidden"}`}
                >
                  <div className="flex justify-between items-center px-4 py-2 bg-[#252526] border-b border-[#3e3e42] shrink-0">
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] uppercase font-bold text-gray-500 font-mono tracking-wider">
                        Editor HTML
                      </span>
                      <span className="text-[10px] text-green-500 font-mono flex items-center gap-1">
                        ● Live
                      </span>
                    </div>
                    <div className="flex gap-2 text-[10px] text-gray-500 font-mono">
                      <span>
                        Ln {newTemplate.content?.split("\n").length || 0}
                      </span>
                      <span>UTF-8</span>
                    </div>
                  </div>
                  <textarea
                    ref={editorRef}
                    value={newTemplate.content}
                    onChange={(e) =>
                      setNewTemplate({
                        ...newTemplate,
                        content: e.target.value,
                      })
                    }
                    className="flex-1 w-full bg-[#1e1e1e] text-[#d4d4d4] font-mono text-xs p-4 focus:outline-none resize-none leading-relaxed selection:bg-indigo-500/30"
                    spellCheck={false}
                    placeholder="<!-- El código HTML generado aparecerá aquí -->"
                  />
                </div>
              </div>

              {/* RIGHT PANEL: PREVIEW */}
              <div className="flex-1 bg-gray-200/50 dark:bg-[#070b0e] relative flex flex-col items-center justify-center p-8 overflow-hidden">
                {newTemplate.content ? (
                  <div
                    className={`transition-all duration-300 overflow-hidden shadow-2xl relative ${
                      previewDevice === "mobile"
                        ? "w-[375px] h-[700px] rounded-[30px] border-[8px] border-gray-800 bg-black"
                        : "w-full h-full max-w-4xl rounded-lg border border-gray-300 dark:border-gray-700"
                    }`}
                  >
                    {/* Status Bar for Mobile */}
                    {previewDevice === "mobile" && (
                      <div className="absolute top-0 w-full h-6 bg-black z-20 flex justify-between px-6 items-center">
                        <div className="text-[10px] text-white font-bold">
                          9:41
                        </div>
                        <div className="flex gap-1">
                          <div className="w-3 h-3 bg-white rounded-full opacity-0"></div>
                        </div>
                      </div>
                    )}

                    <iframe
                      srcDoc={
                        previewDarkMode
                          ? newTemplate.content +
                            `<style>body { background-color: #121212 !important; color: #e0e0e0 !important; } td { color: #e0e0e0 !important; } a { color: #8ab4f8 !important; } .wrapper { background-color: #1e1e1e !important; }</style>`
                          : newTemplate.content
                      }
                      className="w-full h-full bg-white transition-colors"
                      title="Preview"
                      sandbox="allow-same-origin"
                    />
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center text-center opacity-40">
                    <div className="w-32 h-32 bg-gray-300 dark:bg-gray-800 rounded-full flex items-center justify-center mb-6 animate-pulse">
                      <span className="text-4xl grayscale">✉️</span>
                    </div>
                    <h3 className="text-2xl font-bold text-gray-800 dark:text-gray-200">
                      Espacio de Trabajo
                    </h3>
                    <p className="text-gray-500 max-w-xs mt-2">
                      Usa el panel izquierdo para generar tu primera plantilla
                      profesional.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeSection === "history" && (
          <div className="bg-white dark:bg-[#202c33] rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 h-full overflow-hidden flex flex-col">
            <div className="p-4 border-b border-gray-200 dark:border-gray-700">
              <input
                type="text"
                placeholder="Buscar campaña..."
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
                className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-[#111b21] text-sm dark:text-white"
              />
            </div>
            <div className="overflow-y-auto flex-1">
              <table className="w-full text-sm">
                <thead className="text-gray-500 dark:text-gray-400 font-bold border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-[#2a3942]">
                  <tr>
                    <th className="py-3 px-4 text-left">Campaña</th>
                    <th className="py-3 px-4 text-left">Estado</th>
                    <th className="py-3 px-4 text-left">
                      Programación / Fecha
                    </th>
                    <th className="py-3 px-4 text-right">Entregados</th>
                    <th className="py-3 px-4 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {filteredCampaigns.map((c) => (
                    <tr
                      key={c.id}
                      className="hover:bg-gray-50 dark:hover:bg-[#2a3942] transition-colors"
                    >
                      <td className="py-4 px-4">
                        <div className="font-bold text-gray-900 dark:text-white">
                          {c.name}
                        </div>
                        <div className="text-xs text-gray-400">
                          {c.id.slice(0, 8)}
                        </div>
                      </td>
                      <td className="py-4 px-4">
                        <span
                          className={`px-2 py-1 rounded text-xs font-bold uppercase ${
                            c.status === "scheduled"
                              ? "bg-yellow-100 text-yellow-700"
                              : c.status === "processing"
                                ? "bg-blue-100 text-blue-700"
                                : c.status === "completed"
                                  ? "bg-green-100 text-green-700"
                                  : "bg-gray-100 text-gray-700"
                          }`}
                        >
                          {c.status === "scheduled"
                            ? "Programada"
                            : c.status === "processing"
                              ? "En Proceso"
                              : c.status === "completed"
                                ? "Completada"
                                : c.status}
                        </span>
                      </td>
                      <td className="py-4 px-4 text-gray-600 dark:text-gray-300">
                        {c.status === "scheduled" && c.config?.scheduledAt ? (
                          <div className="flex items-center gap-1 text-yellow-600 dark:text-yellow-500 font-medium">
                            <span>🕒</span>
                            {new Date(c.config.scheduledAt).toLocaleString()}
                          </div>
                        ) : (
                          <div className="text-gray-500">
                            {new Date(c.createdAt).toLocaleDateString()}{" "}
                            <span className="text-xs">
                              {new Date(c.createdAt).toLocaleTimeString()}
                            </span>
                          </div>
                        )}
                      </td>
                      <td className="py-4 px-4 text-right font-mono text-gray-700 dark:text-gray-300">
                        {c.stats?.delivered || 0}
                      </td>
                      <td className="py-4 px-4 text-right">
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => handleEditCampaign(c)}
                            className="text-indigo-600 hover:text-indigo-800 font-bold text-xs"
                          >
                            Editar
                          </button>
                          <button
                            onClick={() => handleDeleteCampaign(c.id)}
                            className="text-red-600 hover:text-red-800 font-bold text-xs"
                          >
                            Eliminar
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* MEDICAL LIBRARY GLOBAL MODAL */}
        {showMediaLibrary && (
          <div className="fixed inset-0 z-[110] bg-black/50 backdrop-blur-sm flex items-center justify-center p-8 animate-fade-in">
            <div className="bg-white dark:bg-[#202c33] rounded-2xl shadow-2xl w-full max-w-4xl h-[80vh] overflow-hidden flex flex-col relative animate-scale-in">
              <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-[#111b21]">
                <h3 className="font-bold text-lg dark:text-white flex items-center gap-2">
                  <span>🖼️</span> Galería Multimedia
                </h3>
                <button
                  onClick={() => setShowMediaLibrary(false)}
                  className="text-gray-500 hover:text-gray-700 w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                >
                  ✕
                </button>
              </div>
              <div className="flex-1 overflow-hidden relative">
                <MediaLibrary
                  onSelect={(media) => {
                    const imgTag = `<img src="${media.url}" alt="Imagen" style="max-width: 100%; height: auto; border: 0; display: block;" />`;
                    setNewTemplate((prev) => ({
                      ...prev,
                      content: prev.content + "\n" + imgTag,
                    }));
                    setShowMediaLibrary(false);
                    toast.success("Imagen insertada");
                  }}
                  onClose={() => setShowMediaLibrary(false)}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
