import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { read, utils } from "xlsx";
import { Campaign, MessageTemplate } from "@/types";
import { marketingService } from "@/services/marketingService";
import { API_BASE_URL } from "@/services/apiConfig";

// ────────────────────────────────────────────────
// TYPES
// ────────────────────────────────────────────────

export type MarketingSection = "builder" | "history" | "templates";
export type ChannelType = "WHATSAPP" | "EMAIL" | "SMS";
export type TemplateCategory = "MARKETING" | "UTILITY" | "AUTHENTICATION";
export type ScheduleMode = "now" | "later";
export type PreviewDevice = "mobile" | "desktop";

export interface NewTemplateState {
  id: string | undefined;
  name: string;
  content: string;
  category: TemplateCategory;
  subject: string;
  preheader: string;
}

export interface CampaignConfig {
  messagesPerMinute: number;
  randomizeDelay: boolean;
}

const DEFAULT_TEMPLATE: NewTemplateState = {
  id: "",
  name: "",
  content: "",
  category: "MARKETING",
  subject: "",
  preheader: "",
};

// ────────────────────────────────────────────────
// HOOK
// ────────────────────────────────────────────────

export const useMarketingDashboard = () => {
  const { t } = useTranslation();
  // ── Navigation ──
  const [activeSection, setActiveSection] = useState<MarketingSection>("builder");
  const [builderStep, setBuilderStep] = useState(1);

  // ── Data ──
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [tags, setTags] = useState<Array<{ id: string; name: string; color: string; count?: number }>>([]);
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);

  // ── History Filters ──
  const [historySearch, setHistorySearch] = useState("");

  // ── Campaign Form ──
  const [campaignName, setCampaignName] = useState("");
  const [selectedChannel, setSelectedChannel] = useState<ChannelType>("WHATSAPP");
  const [emailSubject, setEmailSubject] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [templateVariables, setTemplateVariables] = useState<Record<string, string>>({});
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [targetPhones, setTargetPhones] = useState<string[]>([]);
  const [excelFileName, setExcelFileName] = useState("");
  const [audienceCount, setAudienceCount] = useState(0);

  // ── Template Manager ──
  const [newTemplate, setNewTemplate] = useState<NewTemplateState>(DEFAULT_TEMPLATE);
  const [isCreatingTemplate, setIsCreatingTemplate] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);
  const [showMediaLibrary, setShowMediaLibrary] = useState(false);
  const [previewDevice, setPreviewDevice] = useState<PreviewDevice>("mobile");
  const [previewDarkMode, setPreviewDarkMode] = useState(false);
  const [showCodeEditor, setShowCodeEditor] = useState(false);
  const [generationStatus, setGenerationStatus] = useState("");
  const [showEmailSettings, setShowEmailSettings] = useState(false);

  // ── Undo/Redo ──
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const [historyStack, setHistoryStack] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  // ── Scheduling ──
  const [scheduleMode, setScheduleMode] = useState<ScheduleMode>("now");
  const [scheduledDate, setScheduledDate] = useState("");
  const [editingCampaignId, setEditingCampaignId] = useState<string | null>(null);
  const [config, setConfig] = useState<CampaignConfig>({
    messagesPerMinute: 30,
    randomizeDelay: true,
  });
  const [isSending, setIsSending] = useState(false);

  // ────────────────────────────────────────────
  // DATA FETCHING
  // ────────────────────────────────────────────

  const loadData = async () => {
    try {
      const token = localStorage.getItem("token");
      if (!token) return;

      const campaignsData = await marketingService.getCampaigns();
      setCampaigns(campaignsData);

      const tagsRes = await fetch(`${API_BASE_URL}/tags`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (tagsRes.ok) {
        const tagsData = await tagsRes.json();
        setTags(tagsData);
      }

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

  useEffect(() => { loadData(); }, []);

  // ── Audience Count Effect ──
  useEffect(() => {
    const totalCount = selectedTags.reduce((acc, tagId) => {
      const tag = tags.find((t) => t.id === tagId);
      return acc + (tag?.count || 0);
    }, 0);
    setAudienceCount(totalCount + targetPhones.length);
  }, [selectedTags, tags, targetPhones]);

  // ── Undo/Redo History ──
  const addToHistory = (content: string) => {
    if (historyIndex >= 0 && historyStack[historyIndex] === content) return;
    const newStack = historyStack.slice(0, historyIndex + 1);
    newStack.push(content);
    if (newStack.length > 50) newStack.shift();
    setHistoryStack(newStack);
    setHistoryIndex(newStack.length - 1);
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      if (newTemplate.content) addToHistory(newTemplate.content);
    }, 800);
    return () => clearTimeout(timer);
  }, [newTemplate.content]);

  const manualUndo = () => {
    if (historyIndex > 0) {
      const prev = historyStack[historyIndex - 1];
      setNewTemplate((t) => ({ ...t, content: prev }));
      setHistoryIndex(historyIndex - 1);
    } else {
      toast.info(t("marketing_dashboard_hook.toast.nothing_to_undo", "Sin acciones para deshacer"));
    }
  };

  const manualRedo = () => {
    if (historyIndex < historyStack.length - 1) {
      const next = historyStack[historyIndex + 1];
      setNewTemplate((t) => ({ ...t, content: next }));
      setHistoryIndex(historyIndex + 1);
    } else {
      toast.info(t("marketing_dashboard_hook.toast.nothing_to_redo", "Sin acciones para rehacer"));
    }
  };

  // ────────────────────────────────────────────
  // ACTIONS
  // ────────────────────────────────────────────

  const toggleTag = (tagId: string) => {
    setSelectedTags((prev) =>
      prev.includes(tagId) ? prev.filter((t) => t !== tagId) : [...prev, tagId],
    );
  };

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
      toast.success(t("marketing_dashboard_hook.toast.variable_inserted", "Variable insertada"));
    } else {
      navigator.clipboard.writeText(tag);
      toast.info(t("marketing_dashboard_hook.toast.copied", "Copiado"));
    }
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
    jsonData.forEach((row: unknown) => {
      const cells = row as unknown[];
      if (cells[0]) {
        const phone = String(cells[0]).replace(/\D/g, "");
        if (phone.length >= 7) phones.push(phone);
      }
    });
    setTargetPhones(phones);
  };

  const getSelectedTemplate = () => templates.find((t) => t.id === selectedTemplateId);

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
        setNewTemplate(DEFAULT_TEMPLATE);
        setIsCreatingTemplate(false);
        loadData();
        toast.success(t("marketing_dashboard_hook.toast.template_created", "Plantilla creada"));
      }
    } catch (e) {
      console.error(e);
      toast.error(t("marketing_dashboard_hook.toast.template_create_error", "Error al crear plantilla"));
    }
  };

  const handleDeleteTemplate = async (id: string) => {
    if (!confirm(t("marketing_dashboard_hook.confirm.delete_template", "¿Eliminar plantilla?"))) return;
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
    setCampaignName(campaign.name);
    setSelectedChannel(campaign.channel || "WHATSAPP");
    setEmailSubject(campaign.subject || "");
    setSelectedTemplateId(campaign.templateId || "");
    setSelectedTags(campaign.targetTags || []);
    const configPhones =
      ((campaign.config as unknown as Record<string, unknown>)?.targetPhones as string[]) || [];
    setTargetPhones(configPhones);
    setExcelFileName(configPhones.length > 0 ? `${configPhones.length} números importados` : "");
    if (campaign.config?.scheduledAt) {
      setScheduleMode("later");
      const date = new Date(campaign.config.scheduledAt);
      setScheduledDate(date.toISOString().slice(0, 16));
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
    if (!confirm(t("marketing_dashboard_hook.confirm.delete_campaign", "¿Estás seguro de eliminar esta campaña?"))) return;
    try {
      await marketingService.deleteCampaign(id);
      setCampaigns((prev) => prev.filter((c) => c.id !== id));
      toast.success(t("marketing_dashboard_hook.toast.campaign_deleted", "Campaña eliminada"));
    } catch (error) {
      console.error("Error deleting campaign:", error);
      toast.error(t("marketing_dashboard_hook.toast.campaign_delete_error", "Error al eliminar campaña"));
    }
  };

  const handleLaunch = async () => {
    if (!campaignName || !selectedTemplateId || (selectedTags.length === 0 && targetPhones.length === 0)) {
      toast.error(t("marketing_dashboard_hook.toast.required_fields", "Completa los campos requeridos"));
      return;
    }
    if (scheduleMode === "later" && !scheduledDate) {
      toast.error(t("marketing_dashboard_hook.toast.select_date_time", "Selecciona fecha y hora"));
      return;
    }

    setIsSending(true);
    try {
      const template = getSelectedTemplate();
      let content = "";
      if (template && Array.isArray(template.components)) {
        const body = template.components.find((c) => c.type === "BODY");
        content = body?.text || "";
      }

      const finalConfig = {
        ...config,
        targetPhones,
        scheduledAt: scheduleMode === "later" && scheduledDate ? new Date(scheduledDate) : undefined,
      };

      if (editingCampaignId) {
        const updated = await marketingService.updateCampaign(editingCampaignId, {
          name: campaignName,
          messageContent: content,
          templateId: selectedTemplateId,
          targetTags: selectedTags,
          status: scheduleMode === "later" ? "scheduled" : "processing",
          config: finalConfig,
        });
        setCampaigns((prev) => prev.map((c) => (c.id === editingCampaignId ? updated : c)));
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

      // Reset form
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
      toast.success(editingCampaignId ? t("marketing_dashboard_hook.toast.campaign_updated", "Campaña actualizada") : t("marketing_dashboard_hook.toast.campaign_created", "Campaña creada y lanzada"));
    } catch (error) {
      console.error("Error launching/updating campaign:", error);
      setIsSending(false);
      toast.error(t("marketing_dashboard_hook.toast.campaign_save_error", "Error al guardar campaña"));
    }
  };

  const handleGenerateAI = async () => {
    if (!aiPrompt) return;
    setIsGeneratingAI(true);
    setGenerationStatus("Analizando solicitud de diseño...");
    setTimeout(() => setGenerationStatus("Estructurando tablas responsive..."), 1500);
    setTimeout(() => setGenerationStatus("Optimizando estilos visuales..."), 3000);

    try {
      let userMessage = aiPrompt;
      if (newTemplate.content && newTemplate.content.length > 50) {
        userMessage = `CÓDIGO HTML ACTUAL:\n${newTemplate.content}\n\nINSTRUCCIONES DE CAMBIO:\n${aiPrompt}`;
      }
      const res = await marketingService.generateAITemplate(userMessage);
      const clean = res.replace(/```html/g, "").replace(/```/g, "");
      setNewTemplate((prev) => ({ ...prev, content: clean }));
      setAiPrompt("");
      toast.success(t("marketing_dashboard_hook.toast.design_updated", "Diseño actualizado"));
    } catch (e) {
      console.error(e);
      toast.error(t("marketing_dashboard_hook.toast.generate_error", "Error al generar"));
    } finally {
      setIsGeneratingAI(false);
      setGenerationStatus("");
    }
  };

  const filteredCampaigns = campaigns.filter((c) =>
    c.name.toLowerCase().includes(historySearch.toLowerCase()),
  );

  return {
    // Navigation
    activeSection, setActiveSection,
    builderStep, setBuilderStep,

    // Data
    campaigns, tags, templates,

    // History Filters
    historySearch, setHistorySearch,
    filteredCampaigns,

    // Campaign Form
    campaignName, setCampaignName,
    selectedChannel, setSelectedChannel,
    emailSubject, setEmailSubject,
    selectedTemplateId, setSelectedTemplateId,
    templateVariables, setTemplateVariables,
    selectedTags, setSelectedTags,
    targetPhones, setTargetPhones,
    excelFileName, setExcelFileName,
    audienceCount,

    // Template Manager
    newTemplate, setNewTemplate,
    isCreatingTemplate, setIsCreatingTemplate,
    aiPrompt, setAiPrompt,
    isGeneratingAI,
    showMediaLibrary, setShowMediaLibrary,
    previewDevice, setPreviewDevice,
    previewDarkMode, setPreviewDarkMode,
    showCodeEditor, setShowCodeEditor,
    generationStatus,
    showEmailSettings, setShowEmailSettings,

    // Undo/Redo
    editorRef, historyStack, historyIndex,
    manualUndo, manualRedo,

    // Scheduling
    scheduleMode, setScheduleMode,
    scheduledDate, setScheduledDate,
    editingCampaignId,
    config, setConfig,
    isSending,

    // Actions
    toggleTag,
    insertVariable,
    handleFileUpload,
    getSelectedTemplate,
    handleTemplateChange,
    handleCreateTemplate,
    handleDeleteTemplate,
    handleEditCampaign,
    handleDeleteCampaign,
    handleLaunch,
    handleGenerateAI,
  };
};
