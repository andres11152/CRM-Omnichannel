import { useState, useEffect } from "react";
import { toast } from "sonner";
import { api } from "@/lib/axios";
import { useAuthStore } from "@/stores/authStore";
import { useSound } from "@/components/SoundContext";

// ────────────────────────────────────────────────
// TYPES
// ────────────────────────────────────────────────

export interface DaySchedule {
  open: string;
  close: string;
  active: boolean;
}

export type DayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

export interface CompanySettingsState {
  general: {
    name: string;
    logo: string;
    slug: string;
    address: string;
    phone: string;
    website: string;
    timezone: string;
  };
  businessHours: {
    enabled: boolean;
    schedule: Record<DayKey, DaySchedule>;
  };
  automation: {
    welcomeMessage: string;
    welcomeEnabled: boolean;
    oooMessage: string;
    oooEnabled: boolean;
  };
  smtp: {
    provider: string;
    host: string;
    port: number;
    user: string;
    password: string;
    hasPassword: boolean;
    secure: boolean;
    senderEmail: string;
    senderName: string;
  };
  billing: {
    plan: { name?: string; price?: number } | null;
    subscriptionEndsAt: string | null;
  };
}

export interface PlanData {
  plan: {
    limits: {
      max_users: number;
      max_whatsapp_sessions: number;
      max_queues: number;
      max_ai_assistants?: number;
      storage_limit_gb?: number;
      max_contacts?: number;
      max_workflows?: number;
      max_companies?: number;
    };
  };
  usage: {
    users: number;
    whatsapp_sessions: number;
    queues: number;
    ai_assistants: number;
    storage_bytes: number;
    contacts: number;
    workflows: number;
    companies: number;
  };
  percentages: {
    users: number;
    whatsapp_sessions: number;
    queues: number;
    ai_assistants: number;
    storage: number;
    contacts: number;
    workflows: number;
    companies: number;
  };
}

// ────────────────────────────────────────────────
// DEFAULTS
// ────────────────────────────────────────────────

const defaultSettings: CompanySettingsState = {
  general: {
    name: "",
    logo: "",
    slug: "",
    address: "",
    phone: "",
    website: "",
    timezone: "UTC",
  },
  businessHours: {
    enabled: true,
    schedule: {
      mon: { open: "08:00", close: "18:00", active: true },
      tue: { open: "08:00", close: "18:00", active: true },
      wed: { open: "08:00", close: "18:00", active: true },
      thu: { open: "08:00", close: "18:00", active: true },
      fri: { open: "08:00", close: "18:00", active: true },
      sat: { open: "09:00", close: "12:00", active: true },
      sun: { open: "00:00", close: "00:00", active: false },
    },
  },
  automation: {
    welcomeMessage: "",
    welcomeEnabled: true,
    oooMessage: "",
    oooEnabled: true,
  },
  smtp: {
    provider: "SMTP",
    host: "",
    port: 587,
    user: "",
    password: "",
    hasPassword: false,
    secure: true,
    senderEmail: "",
    senderName: "",
  },
  billing: {
    plan: null,
    subscriptionEndsAt: null,
  },
};

// ────────────────────────────────────────────────
// TABS
// ────────────────────────────────────────────────

export type SettingsTab =
  | "general"
  | "hours"
  | "automation"
  | "email"
  | "security"
  | "billing"
  | "sound"
  | "permissions";

// ────────────────────────────────────────────────
// HOOK
// ────────────────────────────────────────────────

export const useCompanySettings = () => {
  const { user } = useAuthStore();
  const { playSound } = useSound();

  // ── State ──
  const [activeTab, setActiveTab] = useState<SettingsTab>("general");
  const [settings, setSettings] = useState<CompanySettingsState>(defaultSettings);
  const [loading, setLoading] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [helpTab, setHelpTab] = useState<"gmail" | "outlook" | "zoho" | "cpanel">("gmail");
  const [planData, setPlanData] = useState<PlanData | null>(null);
  const [passwords, setPasswords] = useState({ current: "", new: "", confirm: "" });
  const [googleCalendarConnected, setGoogleCalendarConnected] = useState(false);

  // ── Avatar Picker ──
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerTarget, setPickerTarget] = useState<"user" | "company" | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);

  // ── Data Fetching ──
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        setLoading(true);
        const res = await api.get("/company/settings");
        const data = res.data;
        const settingsData = data.data || data;

        if (settingsData) {
          setSettings((prev) => ({
            ...prev,
            general: { ...prev.general, ...settingsData.general },
            businessHours: { ...prev.businessHours, ...settingsData.businessHours },
            automation: { ...prev.automation, ...settingsData.automation },
            smtp: settingsData.smtp ? { ...prev.smtp, ...settingsData.smtp } : prev.smtp,
            billing: settingsData.billing,
          }));
        }
      } catch (error) {
        console.error("Failed to fetch company settings:", error);
        toast.error("Error cargando configuración");
      } finally {
        setLoading(false);
      }
    };

    const fetchPlanData = async () => {
      try {
        const res = await api.get("/usage/stats");
        setPlanData(res.data.data || res.data);
      } catch (error) {
        console.error("Failed to fetch plan data:", error);
      }
    };

    const fetchGoogleStatus = async () => {
      try {
        const res = await api.get("/google/status");
        setGoogleCalendarConnected((res.data.data || res.data).connected);
      } catch (error) {
        console.error("Failed to fetch Google Calendar status:", error);
      }
    };

    fetchGoogleStatus();
    fetchSettings();
    fetchPlanData();
  }, []);

  // Auto-switch Help Tab when Host changes
  useEffect(() => {
    if (settings.smtp.host.includes("gmail") || settings.smtp.host.includes("google")) {
      setHelpTab("gmail");
    } else if (settings.smtp.host.includes("outlook") || settings.smtp.host.includes("office365")) {
      setHelpTab("outlook");
    } else if (settings.smtp.host.includes("zoho")) {
      setHelpTab("zoho");
    }
  }, [settings.smtp.host]);

  // ── Actions ──
  const updateSetting = (
    section: keyof CompanySettingsState,
    key: string,
    value: string | boolean | number,
  ) => {
    setSettings((prev) => ({
      ...prev,
      [section]: {
        ...(prev[section] as Record<string, unknown>),
        [key]: value,
      },
    }));
  };

  const updateBusinessHour = (day: string, field: string, value: string | boolean) => {
    setSettings((prev) => ({
      ...prev,
      businessHours: {
        ...prev.businessHours,
        schedule: {
          ...prev.businessHours.schedule,
          [day as DayKey]: {
            ...prev.businessHours.schedule[day as DayKey],
            [field]: value,
          },
        },
      },
    }));
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      if (activeTab === "security") {
        if (passwords.new !== passwords.confirm) {
          toast.error("Las contraseñas no coinciden");
          setLoading(false);
          return;
        }

        const authRes = await api.patch(`/auth/update-password`, {
          currentPassword: passwords.current,
          newPassword: passwords.new,
          confirmPassword: passwords.confirm,
        });

        if (authRes.data.token) {
          localStorage.setItem("token", authRes.data.token);
        }

        setPasswords({ current: "", new: "", confirm: "" });
        toast.success("Contraseña actualizada correctamente");
      } else {
        await api.patch("/company/settings", settings);
        toast.success("Configuración de empresa guardada");
      }
      playSound("success");
    } catch (error: unknown) {
      console.error("Failed to save settings:", error);
      const msg = error instanceof Error ? error.message : "Error al guardar cambios";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleTestEmail = async () => {
    if (!settings.smtp.host || !settings.smtp.user) {
      toast.error("Ingresa al menos el Host y Usuario");
      return;
    }

    const targetEmail = user?.email || settings.smtp.senderEmail;
    if (!targetEmail) {
      toast.error("No se pudo determinar el correo destinatario de prueba (configure el email de remitente o verifique su perfil)");
      return;
    }

    setTestingConnection(true);
    const toastId = toast.loading("Probando conexión SMTP...");

    try {
      await api.post("/emails/test-connection", {
        host: settings.smtp.host,
        port: settings.smtp.port,
        user: settings.smtp.user,
        password: settings.smtp.password,
        secure: settings.smtp.secure,
        toEmail: targetEmail,
        senderEmail: settings.smtp.senderEmail,
      });
      toast.success(`Conexión Exitosa. Correo enviado a ${targetEmail}`, { id: toastId });
      playSound("success");
    } catch (error: unknown) {
      console.error("SMTP Test Failed:", error);
      const msg = error instanceof Error ? error.message : "Falló la conexión";
      toast.error(`Error: ${msg}`, { id: toastId });
      playSound("error");
    } finally {
      setTestingConnection(false);
    }
  };

  const handleAvatarSelect = (url: string) => {
    if (pickerTarget === "company") {
      updateSetting("general", "logo", url);
    }
    setPickerOpen(false);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);

    setUploadingImage(true);
    try {
      const res = await api.post("/media/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      const data = res.data;
      const uploadedUrl = data.data?.media?.url || data.data?.url || data.url;

      if (uploadedUrl) {
        handleAvatarSelect(uploadedUrl);
        toast.success("Imagen subida correctamente");
      } else {
        toast.error("No se pudo obtener la URL de la imagen");
      }
    } catch (error: unknown) {
      console.error("Upload error:", error);
      toast.error("Error al subir la imagen");
    } finally {
      setUploadingImage(false);
    }
  };

  const handleGoogleDisconnect = async () => {
    try {
      await api.post("/google/disconnect");
      setGoogleCalendarConnected(false);
      toast.success("Google Calendar desconectado");
    } catch {
      toast.error("Error al desconectar");
    }
  };

  const handleGoogleConnect = () => {
    const token = localStorage.getItem("token");
    if (!token) {
      toast.error("Por favor inicia sesión primero");
      return;
    }
    const payload = JSON.parse(atob(token.split(".")[1]));
    const userId = payload.id;
    window.location.href = `${import.meta.env.VITE_API_BASE_URL || "http://localhost:4000"}/api/google/auth?userId=${userId}`;
  };

  return {
    // State
    user,
    activeTab,
    setActiveTab,
    settings,
    loading,
    testingConnection,
    helpTab,
    setHelpTab,
    planData,
    passwords,
    setPasswords,
    googleCalendarConnected,

    // Avatar Picker
    pickerOpen,
    setPickerOpen,
    pickerTarget,
    setPickerTarget,
    uploadingImage,

    // Actions
    updateSetting,
    updateBusinessHour,
    handleSave,
    handleTestEmail,
    handleAvatarSelect,
    handleFileUpload,
    handleGoogleDisconnect,
    handleGoogleConnect,
  };
};
