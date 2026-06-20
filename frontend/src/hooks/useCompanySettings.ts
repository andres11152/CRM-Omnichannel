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
    plan: { id?: string; name?: string; price?: number } | null;
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

  // ── MercadoPago Direct Card Subscription States ──
  const [availablePlans, setAvailablePlans] = useState<any[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState<string>("");
  const [cardForm, setCardForm] = useState({
    cardNumber: "",
    cardholderName: "",
    expiryDate: "",
    cvv: "",
  });

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
          if (settingsData.billing?.plan?.id) {
            setSelectedPlanId(settingsData.billing.plan.id);
          }
        }
      } catch (error) {
        console.error("Failed to fetch company settings:", error);
        toast.error("Error al cargar configuración");
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

    const fetchAvailablePlans = async () => {
      try {
        const res = await api.get("/payments/plans");
        const plans = res.data.data || res.data;
        setAvailablePlans(plans);
      } catch (error) {
        console.error("Failed to fetch available subscription plans:", error);
      }
    };

    fetchGoogleStatus();
    fetchSettings();
    fetchPlanData();
    fetchAvailablePlans();
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
        toast.success("Contraseña actualizada");
      } else {
        await api.patch("/company/settings", settings);
        toast.success("Configuración guardada");
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
      toast.error("Host y usuario requeridos");
      return;
    }

    const targetEmail = user?.email || settings.smtp.senderEmail;
    if (!targetEmail) {
      toast.error("Configura el email de remitente primero");
      return;
    }

    setTestingConnection(true);
    const toastId = toast.loading("Probando SMTP…");

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
      toast.success(`Correo de prueba enviado`, { id: toastId });
      playSound("success");
    } catch (error: unknown) {
      console.error("SMTP Test Failed:", error);
      const msg = error instanceof Error ? error.message : "Falló la conexión";
      toast.error(`SMTP: ${msg}`, { id: toastId });
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
        toast.success("Imagen actualizada");
      } else {
        toast.error("Error al subir imagen");
      }
    } catch (error: unknown) {
      console.error("Upload error:", error);
      toast.error("Error al subir imagen");
    } finally {
      setUploadingImage(false);
    }
  };

  const handleGoogleDisconnect = async () => {
    try {
      await api.post("/google/disconnect");
      setGoogleCalendarConnected(false);
      toast.success("Google Calendar desvinculado");
    } catch {
      toast.error("Error al desvincular");
    }
  };

  const handleGoogleConnect = () => {
    const token = localStorage.getItem("token");
    if (!token) {
      toast.error("Sesión requerida");
      return;
    }
    const payload = JSON.parse(atob(token.split(".")[1]));
    const userId = payload.id;
    window.location.href = `${import.meta.env.VITE_API_BASE_URL || "http://localhost:4000"}/api/google/auth?userId=${userId}`;
  };

  const handlePayMercadoPago = async () => {
    try {
      setLoading(true);
      const planId = settings.billing.plan?.id;
      if (!planId) {
        toast.error("Plan no encontrado");
        return;
      }
      
      const res = await api.post("/payments/create-checkout-session", {
        priceId: planId,
      });
      
      if (res.data?.url) {
        window.location.href = res.data.url;
      } else {
        toast.error("Error al redirigir a pago");
      }
    } catch (error) {
      console.error("Failed to initialize MercadoPago checkout:", error);
      toast.error("Error al iniciar pago");
    } finally {
      setLoading(false);
    }
  };

  const handleSubscribeCard = async () => {
    if (!selectedPlanId) {
      toast.error("Selecciona un plan");
      return;
    }
    if (!cardForm.cardNumber || !cardForm.cardholderName || !cardForm.expiryDate || !cardForm.cvv) {
      toast.error("Completa los datos de la tarjeta");
      return;
    }

    setLoading(true);
    try {
      // In production, we would use MercadoPago's SDK:
      // const mp = new window.MercadoPago(publicKey);
      // const tokenResult = await mp.fields.createCardToken({...});
      const mockCardToken = `mp_tok_${Math.random().toString(36).substring(7)}`;

      const res = await api.post("/payments/subscribe-card", {
        token: mockCardToken,
        planId: selectedPlanId,
        paymentMethodId: "visa",
      });

      if (res.data?.success) {
        toast.success("Suscripción activada");
        playSound("success");
        // Refetch settings to update UI state
        const settingsRes = await api.get("/company/settings");
        const settingsData = settingsRes.data.data || settingsRes.data;
        if (settingsData) {
          setSettings((prev) => ({
            ...prev,
            billing: settingsData.billing,
          }));
        }
      } else {
        toast.error("Error al procesar pago");
      }
    } catch (error) {
      console.error("Card subscription failed:", error);
      toast.error("Error al procesar tarjeta");
    } finally {
      setLoading(false);
    }
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

    // MercadoPago subscription
    availablePlans,
    selectedPlanId,
    setSelectedPlanId,
    cardForm,
    setCardForm,

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
    handlePayMercadoPago,
    handleSubscribeCard,
  };
};

