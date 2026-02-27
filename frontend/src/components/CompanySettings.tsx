import React, { useState, useEffect } from "react";
import { toast } from "sonner";
import { ModuleHeader } from "./common/ModuleHeader";
import { useSound } from "./SoundContext";
import { api } from "@/lib/axios";
import { User } from "@/types";
import { useAuthStore } from "@/stores/authStore";
import SoundSettings from "./SoundSettings";
import PermissionsPanel from "./PermissionsPanel";

const defaultSettings = {
  // ... (keep same)
  general: {
    name: "",
    logo: "",
    slug: "",
    address: "",
    phone: "",
    website: "",
    timezone: "UTC",
  },
  // ... (keep rest)
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
    hasPassword: false, // UI flag to know if password is set but hidden
    secure: true,
    senderEmail: "",
    senderName: "",
  },
  billing: {
    plan: null as any,
    subscriptionEndsAt: null as string | null,
  },
};

// ... interfaces

export const CompanySettings: React.FC = () => {
  const { user, updateUser: onUserUpdate } = useAuthStore();
  const { playSound } = useSound();
  const [activeTab, setActiveTab] = useState<
    | "general"
    | "hours"
    | "automation"
    | "email"
    | "security"
    | "billing"
    | "sound"
    | "permissions"
  >("general");

  // --- Picker State ---
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerTarget, setPickerTarget] = useState<"user" | "company" | null>(
    null,
  );
  const [uploadingImage, setUploadingImage] = useState(false);

  /* User Form Removed - Moved to ProfileSettings */

  /* User User Effect Removed */

  const [settings, setSettings] = useState(defaultSettings);
  const [loading, setLoading] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [helpTab, setHelpTab] = useState<
    "gmail" | "outlook" | "zoho" | "cpanel"
  >("gmail");
  const [planData, setPlanData] = useState<PlanData | null>(null);

  const [passwords, setPasswords] = useState({
    current: "",
    new: "",
    confirm: "",
  });
  const [googleCalendarConnected, setGoogleCalendarConnected] = useState(false);

  // Fetch plan data on mount
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        setLoading(true);
        const res = await api.get("/company/settings");
        const data = res.data; // Axios returns the body in data
        // Check if data is wrapped in 'data' property (standard) or direct
        const settingsData = data.data || data;

        if (settingsData) {
          setSettings((prev) => ({
            ...prev,
            general: { ...prev.general, ...settingsData.general },
            businessHours: {
              ...prev.businessHours,
              ...settingsData.businessHours,
            },
            automation: { ...prev.automation, ...settingsData.automation },
            smtp: settingsData.smtp
              ? { ...prev.smtp, ...settingsData.smtp }
              : prev.smtp,
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
  }, []); // Run only once on mount

  // Auto-switch Help Tab when Host changes
  useEffect(() => {
    if (
      settings.smtp.host.includes("gmail") ||
      settings.smtp.host.includes("google")
    ) {
      setHelpTab("gmail");
    } else if (
      settings.smtp.host.includes("outlook") ||
      settings.smtp.host.includes("office365")
    ) {
      setHelpTab("outlook");
    } else if (settings.smtp.host.includes("zoho")) {
      setHelpTab("zoho");
    }
  }, [settings.smtp.host]);

  interface PlanData {
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

  const handleSave = async () => {
    setLoading(true);
    try {
      /* Profile Save Logic Removed */
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

        // Update Token if provided (Keep session alive)
        if (authRes.data.token) {
          localStorage.setItem("token", authRes.data.token);
        }

        setPasswords({ current: "", new: "", confirm: "" });
        toast.success("Contraseña actualizada correctamente");
      } else {
        // Company Settings
        await api.patch("/company/settings", settings);
        toast.success("Configuración de empresa guardada");
      }

      playSound("success");
    } catch (error: any) {
      console.error("Failed to save settings:", error);
      toast.error(
        error.response?.data?.message ||
          error.message ||
          "Error al guardar cambios",
      );
    } finally {
      setLoading(false);
    }
  };

  const updateSetting = (
    section: keyof typeof defaultSettings,
    startKey: string,
    value: any,
  ) => {
    // Deep update helper would go here, simple version:
    setSettings((prev) => ({
      ...prev,
      [section]: {
        ...prev[section],
        [startKey]: value,
      },
    }));
  };

  const updateBusinessHour = (day: string, field: string, value: any) => {
    setSettings((prev) => ({
      ...prev,
      businessHours: {
        ...prev.businessHours,
        schedule: {
          ...prev.businessHours.schedule,
          [day]: {
            // @ts-ignore
            ...prev.businessHours.schedule[day],
            [field]: value,
          },
        },
      },
    }));
  };

  const handleTestEmail = async () => {
    if (!settings.smtp.host || !settings.smtp.user) {
      toast.error("Ingresa al menos el Host y Usuario");
      return;
    }

    setTestingConnection(true);
    const toastId = toast.loading("Probando conexión SMTP...");

    try {
      // Use current logged in user email as recipient
      const targetEmail =
        user?.email || settings.smtp.senderEmail || "testá@example.com";

      await api.post("/emails/testá-connection", {
        host: settings.smtp.host,
        port: settings.smtp.port,
        user: settings.smtp.user,
        password: settings.smtp.password,
        secure: settings.smtp.secure,
        toEmail: targetEmail,
        senderEmail: settings.smtp.senderEmail,
      });

      toast.success(`Conexión Exitosa. Correo enviado a ${targetEmail}`, {
        id: toastId,
      });
      playSound("success");
    } catch (error: any) {
      console.error("SMTP Test Failed:", error);
      toast.error(`Error: ${error.message || "Falló la conexión"}`, {
        id: toastId,
      });
      playSound("error");
    } finally {
      setTestingConnection(false);
    }
  };

  // --- Avatar Picker Logic ---
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
      // Extract URL properly from Backend Response (data.data.media.url)
      const uploadedUrl = data.data?.media?.url || data.data?.url || data.url;

      if (uploadedUrl) {
        handleAvatarSelect(uploadedUrl);
        toast.success("Imagen subida correctamente");
      } else {
        toast.error("No se pudo obtener la URL de la imagen");
      }
    } catch (error: any) {
      console.error("Upload error:", error);
      toast.error("Error al subir la imagen");
    } finally {
      setUploadingImage(false);
    }
  };

  const AvatarPickerModal = () => {
    if (!pickerOpen) return null;

    const predeterminedAvatars = [
      `https://api.dicebear.com/7.x/avataaars/svg?seed=${Math.random()}`,
      `https://api.dicebear.com/7.x/bottts/svg?seed=${Math.random()}`,
      `https://api.dicebear.com/7.x/initials/svg?seed=${Math.random()}`,
      `https://api.dicebear.com/7.x/micah/svg?seed=${Math.random()}`,
      `https://api.dicebear.com/7.x/notionists/svg?seed=${Math.random()}`,
      `https://api.dicebear.com/7.x/personas/svg?seed=${Math.random()}`,
      // Static useful ones
      "https://ui-avatars.com/api/?name=User&background=0D8ABC&color=fff",
      "https://ui-avatars.com/api/?name=Company&background=random",
    ];

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fadeIn">
        <div className="bg-white dark:bg-reply-panel-dark rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
          <div className="p-4 border-b border-gray-100 dark:border-reply-border-dark flex justify-between items-center">
            <h3 className="font-bold text-lg text-gray-800 dark:text-white">
              Seleccionar{" "}
              {pickerTarget === "user" ? "Foto de Perfil" : "Logo de Empresa"}
            </h3>
            <button
              onClick={() => setPickerOpen(false)}
              className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
            >
              ✕
            </button>
          </div>

          <div className="p-6">
            <h4 className="text-sm font-bold text-gray-500 mb-3 uppercase tracking-wider">
              Subir Imagen
            </h4>
            <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg cursor-pointer hover:bg-reply-bg dark:hover:bg-gray-800 transition-colors">
              <div className="flex flex-col items-center justify-center pt-5 pb-6">
                {uploadingImage ? (
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
                ) : (
                  <>
                    <svg
                      className="w-8 h-8 mb-3 text-gray-400"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                      ></path>
                    </svg>
                    <p className="mb-2 text-sm text-gray-500 dark:text-gray-400">
                      <span className="font-semibold">Haz clic para subir</span>
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      PNG, JPG or GIF (MAX. 5MB)
                    </p>
                  </>
                )}
              </div>
              <input
                type="file"
                className="hidden"
                accept="image/*"
                onChange={handleFileUpload}
                disabled={uploadingImage}
              />
            </label>

            <div className="relative flex py-5 items-center">
              <div className="flex-grow border-t border-gray-200 dark:border-reply-border-dark"></div>
              <span className="flex-shrink-0 mx-4 text-gray-400 text-xs uppercase">
                O elige uno predeterminado
              </span>
              <div className="flex-grow border-t border-gray-200 dark:border-reply-border-dark"></div>
            </div>

            <div className="grid grid-cols-4 gap-4">
              {predeterminedAvatars.map((url, i) => (
                <button
                  key={i}
                  onClick={() => handleAvatarSelect(url)}
                  className="aspect-square rounded-full overflow-hidden border-2 border-transparent hover:border-indigo-500 transition-all hover:scale-105"
                >
                  <img
                    src={url}
                    alt="Avatar"
                    className="w-full h-full object-cover"
                  />
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case "general":
        return (
          <div className="space-y-6 animate-fadeIn">
            <div className="bg-white dark:bg-reply-panel-dark p-6 rounded-xl border border-gray-200 dark:border-reply-border-dark shadow-sm">
              <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-4">
                Información General
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Logo Section */}
                <div className="col-span-1 md:col-span-2 flex flex-col items-center justify-center p-6 bg-reply-bg dark:bg-black/20 rounded-2xl border border-dashed border-gray-200 dark:border-reply-border-dark/50 mb-4">
                  <div className="relative group">
                    <div className="w-32 h-32 rounded-2xl overflow-hidden border-4 border-white dark:border-reply-border-dark shadow-xl relative">
                      <img
                        src={
                          settings.general.logo ||
                          "https://ui-avatars.com/api/?name=Company&background=random"
                        }
                        className="w-full h-full object-cover"
                        alt="Logo"
                      />
                      {uploadingImage && (
                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                          <div className="w-8 h-8 border-4 border-white border-t-transparent rounded-full animate-spin"></div>
                        </div>
                      )}
                    </div>
                    {/* Logo Picker Trigger */}
                    <button
                      onClick={() => {
                        setPickerTarget("company");
                        setPickerOpen(true);
                      }}
                      className="absolute -bottom-3 -right-3 p-2.5 bg-indigo-600 text-white rounded-xl shadow-lg border-2 border-white dark:border-reply-border-dark hover:bg-indigo-700 transition-all active:scale-90"
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
                          d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
                        />
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
                        />
                      </svg>
                    </button>
                  </div>
                  <div className="mt-4 text-center">
                    <h4 className="text-sm font-bold text-gray-800 dark:text-white uppercase tracking-wider">
                      Logo de la Empresa
                    </h4>
                    <p className="text-[10px] text-gray-500 mt-1">
                      Recomendado: 512x512px (PNG/JPG)
                    </p>
                  </div>
                </div>

                <div className="space-y-4">
                  <label className="block">
                    <span className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-2 block uppercase tracking-tight">
                      Nombre de la Empresa
                    </span>
                    <input
                      type="text"
                      value={settings.general.name}
                      onChange={(e) =>
                        updateSetting("general", "name", e.target.value)
                      }
                      className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-reply-surface-dark rounded-xl px-4 py-3 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all outline-none"
                    />
                  </label>
                </div>
                <div className="space-y-4">
                  <label className="block">
                    <span className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-2 block uppercase tracking-tight">
                      Sitio Web
                    </span>
                    <input
                      type="url"
                      value={settings.general.website}
                      onChange={(e) =>
                        updateSetting("general", "website", e.target.value)
                      }
                      className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-reply-surface-dark rounded-xl px-4 py-3 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all outline-none"
                      placeholder="https://ejemplo.com"
                    />
                  </label>
                </div>
                <div className="space-y-4">
                  <label className="block">
                    <span className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-2 block uppercase tracking-tight">
                      Teléfono Corporativo
                    </span>
                    <input
                      type="tel"
                      value={settings.general.phone}
                      onChange={(e) =>
                        updateSetting("general", "phone", e.target.value)
                      }
                      className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-reply-surface-dark rounded-xl px-4 py-3 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all outline-none"
                    />
                  </label>
                </div>
                <div className="space-y-4">
                  <label className="block">
                    <span className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-2 block uppercase tracking-tight">
                      Zona Horaria
                    </span>
                    <select
                      value={settings.general.timezone}
                      onChange={(e) =>
                        updateSetting("general", "timezone", e.target.value)
                      }
                      className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-reply-surface-dark rounded-xl px-4 py-3 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all outline-none appearance-none"
                    >
                      <option value="America/Bogota">Bogot (GMT-5)</option>
                      <option value="America/Mexico_City">CDMX (GMT-6)</option>
                      <option value="America/New_York">New York (GMT-5)</option>
                      <option value="UTC">UTC (GMT+0)</option>
                    </select>
                  </label>
                </div>
                <div className="col-span-1 md:col-span-2 space-y-4">
                  <label className="block">
                    <span className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-2 block uppercase tracking-tight">
                      Dirección Principal
                    </span>
                    <input
                      type="text"
                      value={settings.general.address}
                      onChange={(e) =>
                        updateSetting("general", "address", e.target.value)
                      }
                      className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-reply-surface-dark rounded-xl px-4 py-3 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all outline-none"
                    />
                  </label>
                </div>
              </div>
            </div>
          </div>
        );

      case "hours":
        return (
          <div className="space-y-6 animate-fadeIn">
            <div className="bg-white dark:bg-reply-panel-dark p-5 md:p-8 rounded-2xl border border-gray-200 dark:border-reply-border-dark shadow-sm relative overflow-hidden">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
                <div>
                  <h3 className="text-xl font-bold text-gray-800 dark:text-white">
                    Horario de Atención
                  </h3>
                  <p className="text-sm text-gray-500 mt-1">
                    Define cundo tu equipo estáá disponible para responder.
                  </p>
                </div>
                <label className="inline-flex items-center cursor-pointer group">
                  <span className="mr-3 text-sm font-bold text-gray-700 dark:text-gray-400 group-hover:text-indigo-600 transition-colors">
                    Estado del Horario
                  </span>
                  <div className="relative">
                    <input
                      type="checkbox"
                      checked={settings.businessHours.enabled}
                      onChange={(e) =>
                        updateSetting(
                          "businessHours",
                          "enabled",
                          e.target.checked,
                        )
                      }
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 dark:peer-focus:ring-indigo-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-indigo-600"></div>
                  </div>
                </label>
              </div>

              <div className="space-y-3 bg-reply-bg dark:bg-black/20 p-4 md:p-6 rounded-2xl">
                {["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map(
                  (day) => {
                    const dayKey =
                      day as keyof typeof settings.businessHours.schedule;
                    // @ts-ignore
                    const dayConfig = settings.businessHours.schedule[dayKey];
                    const dayNames = {
                      mon: "Lunes",
                      tue: "Martes",
                      wed: "Miércoles",
                      thu: "Jueves",
                      fri: "Viernes",
                      sat: "Sbado",
                      sun: "Domingo",
                    };

                    return (
                      <div
                        key={day}
                        className={`flex flex-wrap items-center justify-between gap-4 p-3 rounded-xl transition-all ${dayConfig.active ? "bg-white dark:bg-gray-800 shadow-sm border border-gray-100 dark:border-reply-border-dark" : "opacity-60 underline-offset-4"}`}
                      >
                        <div className="flex items-center gap-3 min-w-[120px]">
                          <input
                            type="checkbox"
                            checked={dayConfig.active}
                            onChange={(e) =>
                              updateBusinessHour(
                                day,
                                "active",
                                e.target.checked,
                              )
                            }
                            className="w-5 h-5 rounded-lg border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                          />
                          <span
                            className={`text-sm font-bold ${dayConfig.active ? "text-gray-900 dark:text-white" : "text-gray-400"}`}
                          >
                            {dayNames[dayKey]}
                          </span>
                        </div>

                        {dayConfig.active ? (
                          <div className="flex items-center gap-2 bg-reply-bg dark:bg-gray-900 p-1.5 rounded-lg border border-gray-100 dark:border-reply-border-dark">
                            <input
                              type="time"
                              value={dayConfig.open}
                              onChange={(e) =>
                                updateBusinessHour(day, "open", e.target.value)
                              }
                              className="bg-transparent text-sm font-bold text-indigo-600 focus:outline-none px-1"
                            />
                            <span className="text-gray-400 px-1">a</span>
                            <input
                              type="time"
                              value={dayConfig.close}
                              onChange={(e) =>
                                updateBusinessHour(day, "close", e.target.value)
                              }
                              className="bg-transparent text-sm font-bold text-indigo-600 focus:outline-none px-1"
                            />
                          </div>
                        ) : (
                          <span className="text-xs font-medium text-gray-400 uppercase tracking-widest bg-gray-100 dark:bg-gray-700/50 px-3 py-1 rounded-full">
                            No Laboral
                          </span>
                        )}
                      </div>
                    );
                  },
                )}
              </div>
            </div>
          </div>
        );

      case "automation":
        return (
          <div className="space-y-6 animate-fadeIn">
            {/* Welcome Message Card */}
            <div className="bg-white dark:bg-reply-panel-dark p-5 md:p-8 rounded-2xl border border-gray-200 dark:border-reply-border-dark shadow-sm relative group overflow-hidden">
              <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
                <svg
                  className="w-24 h-24 text-emerald-500"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M20 2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h14l4 4V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z" />
                </svg>
              </div>
              <div className="flex items-center gap-3 mb-4 relative z-10">
                <div className="p-2 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg text-emerald-600">
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
                      d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                </div>
                <h3 className="text-lg font-bold text-gray-800 dark:text-white">
                  Respuesta de Bienvenida
                </h3>
              </div>
              <p className="text-sm text-gray-500 mb-6 leading-relaxed">
                Este mensaje se enviar automticamente a nuevos contactos o
                tras 24h de inactividad.
              </p>
              <textarea
                className="w-full h-32 border border-gray-200 dark:border-reply-border-dark rounded-2xl p-4 text-sm bg-reply-bg dark:bg-black/20 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all outline-none resize-none no-scrollbar font-medium"
                value={settings.automation.welcomeMessage}
                onChange={(e) =>
                  updateSetting("automation", "welcomeMessage", e.target.value)
                }
                placeholder="Hola! Gracias por contactarnos..."
              ></textarea>
            </div>

            {/* OOO Message Card */}
            <div className="bg-white dark:bg-reply-panel-dark p-5 md:p-8 rounded-2xl border border-gray-200 dark:border-reply-border-dark shadow-sm relative group overflow-hidden">
              <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
                <svg
                  className="w-24 h-24 text-amber-500"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z" />
                </svg>
              </div>
              <div className="flex justify-between items-center mb-4 relative z-10">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-lg text-amber-600">
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
                        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                  </div>
                  <h3 className="text-lg font-bold text-gray-800 dark:text-white">
                    Horario de Ausencia (OOO)
                  </h3>
                </div>
                <span className="text-[10px] items-center gap-1 font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full uppercase hidden sm:flex">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>{" "}
                  Sistema Auto
                </span>
              </div>
              <p className="text-sm text-gray-500 mb-6 leading-relaxed">
                Se envía automticamente cuando un cliente escribe fuera de tu
                horario laboral configurado.
              </p>
              <textarea
                className="w-full h-32 border border-gray-200 dark:border-reply-border-dark rounded-2xl p-4 text-sm bg-reply-bg dark:bg-black/20 text-gray-900 dark:text-white focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all outline-none resize-none no-scrollbar font-medium"
                value={settings.automation.oooMessage}
                onChange={(e) =>
                  updateSetting("automation", "oooMessage", e.target.value)
                }
                placeholder="Lo sentimos, en este momento no estamos disponibles..."
              ></textarea>
            </div>

            {/* Google Calendar Integration */}
            <div className="bg-white dark:bg-reply-panel-dark p-6 rounded-xl border border-gray-200 dark:border-reply-border-dark shadow-sm">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-bold text-gray-800 dark:text-white">
                  Google Calendar
                </h3>
                {googleCalendarConnected ? (
                  <span className="text-xs font-bold bg-green-100 text-green-800 px-3 py-1 rounded-full flex items-center gap-1">
                    ✓ Conectado
                  </span>
                ) : (
                  <span className="text-xs font-bold bg-gray-100 text-gray-600 px-3 py-1 rounded-full">
                    No Conectado
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-500 mb-4">
                Sincroniza automticamente tus reuniones del CRM con Google
                Calendar.
              </p>
              {googleCalendarConnected ? (
                <div className="flex gap-2">
                  <button
                    onClick={async () => {
                      try {
                        await api.post("/google/disconnect");
                        setGoogleCalendarConnected(false);
                        toast.success("Google Calendar desconectado");
                      } catch (error) {
                        toast.error("Error al desconectar");
                      }
                    }}
                    className="text-sm text-red-600 hover:text-red-700 font-bold"
                  >
                    Desconectar
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => {
                    // Get user ID from token
                    const token = localStorage.getItem("token");
                    if (!token) {
                      toast.error("Por favor inicia sesión primero");
                      return;
                    }

                    // Decode token to get userId
                    const payload = JSON.parse(atob(token.split(".")[1]));
                    const userId = payload.id;

                    // Redirect with userId as query param
                    window.location.href = `${import.meta.env.VITE_API_BASE_URL || "http://localhost:4000"}/api/google/auth?userId=${userId}`;
                  }}
                  className="bg-white border-2 border-gray-300 text-gray-700 px-4 py-2 rounded-lg font-semibold hover:bg-reply-bg transition-colors flex items-center gap-2"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    />
                  </svg>
                  Conectar con Google
                </button>
              )}
            </div>
          </div>
        );

      case "email":
        return (
          <div className="space-y-6 animate-fadeIn">
            <div className="bg-white dark:bg-reply-panel-dark p-6 rounded-xl border border-gray-200 dark:border-reply-border-dark shadow-sm">
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h3 className="text-lg font-bold text-gray-800 dark:text-white">
                    Servidor de Correo (SMTP)
                  </h3>
                  <p className="text-sm text-gray-500">
                    Configura tu propio servidor de correo para enviar emails
                    desde tu dominio.
                  </p>
                </div>
                <div className="px-3 py-1 bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 rounded-full text-xs font-bold">
                  {settings.smtp.host ? "Personalizado" : "Sistema (Reply)"}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* PROVIDER GUIDE TABS */}
                <div className="col-span-2 bg-reply-bg dark:bg-gray-800/50 border border-gray-200 dark:border-reply-border-dark rounded-xl overflow-hidden">
                  <div className="bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-reply-border-dark flex text-xs font-bold text-gray-500 overflow-x-auto">
                    <button
                      onClick={() => setHelpTab("gmail")}
                      className={`px-4 py-3 hover:text-indigo-600 transition-colors ${helpTab === "gmail" ? "bg-white dark:bg-reply-panel-dark text-indigo-600 border-b-2 border-indigo-600" : ""}`}
                    >
                      Gmail / G-Suite
                    </button>
                    <button
                      onClick={() => setHelpTab("outlook")}
                      className={`px-4 py-3 hover:text-blue-600 transition-colors ${helpTab === "outlook" ? "bg-white dark:bg-reply-panel-dark text-blue-600 border-b-2 border-blue-600" : ""}`}
                    >
                      Outlook / Office365
                    </button>
                    <button
                      onClick={() => setHelpTab("zoho")}
                      className={`px-4 py-3 hover:text-green-600 transition-colors ${helpTab === "zoho" ? "bg-white dark:bg-reply-panel-dark text-green-600 border-b-2 border-green-600" : ""}`}
                    >
                      Zoho Mail
                    </button>
                    <button
                      onClick={() => setHelpTab("cpanel")}
                      className={`px-4 py-3 hover:text-orange-600 transition-colors ${helpTab === "cpanel" ? "bg-white dark:bg-reply-panel-dark text-orange-600 border-b-2 border-orange-600" : ""}`}
                    >
                      cPanel / Otro
                    </button>
                  </div>

                  <div className="p-4 text-sm text-gray-600 dark:text-gray-300">
                    {helpTab === "gmail" && (
                      <div className="animate-fadeIn">
                        <div className="flex items-center gap-2 mb-2 text-red-600 font-bold">
                          <svg
                            className="w-5 h-5"
                            fill="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path d="M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.91v9.273H1.636A1.636 1.636 0 0 1 0 19.366V5.457c0-2.023 2.309-3.178 3.927-1.964L5.455 4.64 12 9.548l6.545-4.91 1.528-1.145C21.69 2.28 24 3.434 24 5.457z" />
                          </svg>
                          Gmail require "Contraseña de Aplicación"
                        </div>
                        <p className="mb-2">
                          Tu contraseña normal NO funcionar. Debes generar una
                          contraseña especial de 16 caracteres.
                        </p>
                        <ul className="list-disc list-inside space-y-1 text-xs mb-3">
                          <li>
                            Host:{" "}
                            <code className="bg-gray-200 dark:bg-gray-700 px-1 rounded">
                              smtp.gmail.com
                            </code>
                          </li>
                          <li>
                            Puerto:{" "}
                            <code className="bg-gray-200 dark:bg-gray-700 px-1 rounded">
                              465
                            </code>{" "}
                            (Seguro) o{" "}
                            <code className="bg-gray-200 dark:bg-gray-700 px-1 rounded">
                              587
                            </code>
                          </li>
                        </ul>
                        <a
                          href="https://myaccount.google.com/apppasswords"
                          target="_blank"
                          className="text-indigo-600 hover:underline font-bold text-xs"
                        >
                          ➡️ Generar Contraseña Aquí
                        </a>
                      </div>
                    )}

                    {helpTab === "outlook" && (
                      <div className="animate-fadeIn">
                        <div className="flex items-center gap-2 mb-2 text-blue-600 font-bold">
                          <svg
                            className="w-5 h-5"
                            fill="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path d="M1 18l9.508 2.251L22.25 18 23 2l-12.492 2.251L1 2v16zM12.924 5.86l8.895-1.55v13.38l-8.895-1.55V5.86zM9.508 19.467L2.182 17.75V4.25l7.326-1.717v16.934z" />
                          </svg>{" "}
                          Microsoft / Outlook
                        </div>
                        <p className="mb-2">
                          Si tienes 2FA activado, necesitas una App Password. Si
                          no, usa tu contraseña normal.
                        </p>
                        <ul className="list-disc list-inside space-y-1 text-xs">
                          <li>
                            Host:{" "}
                            <code className="bg-gray-200 dark:bg-gray-700 px-1 rounded">
                              smtp.office365.com
                            </code>
                          </li>
                          <li>
                            Puerto:{" "}
                            <code className="bg-gray-200 dark:bg-gray-700 px-1 rounded">
                              587
                            </code>{" "}
                            (STARTTLS)
                          </li>
                        </ul>
                      </div>
                    )}

                    {helpTab === "zoho" && (
                      <div className="animate-fadeIn">
                        <h4 className="font-bold text-green-700 dark:text-green-400 mb-1">
                          Zoho Mail
                        </h4>
                        <ul className="list-disc list-inside space-y-1 text-xs">
                          <li>
                            Host:{" "}
                            <code className="bg-gray-200 dark:bg-gray-700 px-1 rounded">
                              smtp.zoho.com
                            </code>
                          </li>
                          <li>
                            Puerto:{" "}
                            <code className="bg-gray-200 dark:bg-gray-700 px-1 rounded">
                              465
                            </code>{" "}
                            (SSL)
                          </li>
                          <li>Requiere App Password si tienes TFA activado.</li>
                        </ul>
                      </div>
                    )}

                    {helpTab === "cpanel" && (
                      <div className="animate-fadeIn">
                        <h4 className="font-bold text-orange-700 dark:text-orange-400 mb-1">
                          cPanel / Webmail Privado
                        </h4>
                        <p className="mb-2 text-xs">
                          Consulta con tu proveedor de hosting. Generalmente:
                        </p>
                        <ul className="list-disc list-inside space-y-1 text-xs">
                          <li>
                            Host:{" "}
                            <code className="bg-gray-200 dark:bg-gray-700 px-1 rounded">
                              mail.tudominio.com
                            </code>
                          </li>
                          <li>
                            Puerto:{" "}
                            <code className="bg-gray-200 dark:bg-gray-700 px-1 rounded">
                              465
                            </code>{" "}
                            (SSL)
                          </li>
                          <li>Usuario: Tu correo completo.</li>
                        </ul>
                      </div>
                    )}
                  </div>
                </div>

                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Proveedor
                  </label>
                  <select
                    disabled
                    className="w-full border border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-reply-surface-dark rounded-lg px-4 py-2 text-gray-500 cursor-not-allowed"
                    value={settings.smtp.provider}
                  >
                    <option value="SMTP">
                      SMTP Genérico (Outlook, Zoho, cPanel, etc.)
                    </option>
                    <option value="Gmail">
                      Gmail / G-Suite (Próximamente)
                    </option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Servidor SMTP (Host)
                  </label>
                  <input
                    type="text"
                    placeholder="ej. smtp.office365.com"
                    value={settings.smtp.host}
                    onChange={(e) =>
                      updateSetting("smtp", "host", e.target.value)
                    }
                    className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-reply-surface-dark rounded-lg px-4 py-2 text-gray-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Puerto
                  </label>
                  <input
                    type="number"
                    placeholder="587"
                    value={settings.smtp.port}
                    onChange={(e) =>
                      updateSetting("smtp", "port", e.target.value)
                    }
                    className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-reply-surface-dark rounded-lg px-4 py-2 text-gray-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Usuario SMTP
                  </label>
                  <input
                    type="text"
                    placeholder="tu@empresa.com"
                    value={settings.smtp.user}
                    onChange={(e) =>
                      updateSetting("smtp", "user", e.target.value)
                    }
                    className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-reply-surface-dark rounded-lg px-4 py-2 text-gray-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Contraseña SMTP
                  </label>
                  <input
                    type="password"
                    placeholder={
                      settings.smtp.hasPassword
                        ? "•••••••• (Guardada)"
                        : "Ingresa contraseña"
                    }
                    value={settings.smtp.password}
                    onChange={(e) =>
                      updateSetting("smtp", "password", e.target.value)
                    }
                    className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-reply-surface-dark rounded-lg px-4 py-2 text-gray-900 dark:text-white"
                  />
                </div>

                <div className="col-span-2 flex items-center justify-between gap-4 pt-4 border-t border-gray-100 dark:border-reply-border-dark">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={settings.smtp.secure}
                      onChange={(e) =>
                        updateSetting("smtp", "secure", e.target.checked)
                      }
                      className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">
                      Conexión Segura (SSL/TLS)
                    </span>
                  </div>

                  <button
                    onClick={handleTestEmail}
                    disabled={testingConnection || !settings.smtp.host}
                    className="px-4 py-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-sm font-bold transition-colors flex items-center gap-2"
                  >
                    {testingConnection ? (
                      <>
                        <svg
                          className="animate-spin h-4 w-4"
                          viewBox="0 0 24 24"
                          fill="none"
                        >
                          <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                          ></circle>
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                          ></path>
                        </svg>
                        Probando...
                      </>
                    ) : (
                      <>
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
                            d="M13 10V3L4 14h7v7l9-11h-7z"
                          />
                        </svg>
                        Probar Conexión
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-reply-panel-dark p-5 md:p-8 rounded-2xl border border-gray-200 dark:border-reply-border-dark shadow-sm relative overflow-hidden">
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h3 className="text-xl font-bold text-gray-800 dark:text-white">
                    Servidor SMTP
                  </h3>
                  <p className="text-sm text-gray-500 mt-1">
                    Configura el envío de correos desde tu propio dominio.
                  </p>
                </div>
                <div className="hidden sm:block px-3 py-1 bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400 rounded-full text-[10px] font-bold uppercase tracking-wider">
                  {settings.smtp.host ? "Personalizado" : "Sistema"}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {/* SMTP Config Grid */}
                <div className="space-y-4 col-span-1 md:col-span-2">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="md:col-span-2">
                      <label className="block text-xs font-bold text-gray-400 uppercase mb-2">
                        Host SMTP
                      </label>
                      <input
                        type="text"
                        placeholder="smtp.dominio.com"
                        value={settings.smtp.host}
                        onChange={(e) =>
                          updateSetting("smtp", "host", e.target.value)
                        }
                        className="w-full border border-gray-200 dark:border-reply-border-dark bg-reply-bg dark:bg-black/20 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500/20 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-400 uppercase mb-2">
                        Puerto
                      </label>
                      <input
                        type="number"
                        placeholder="587"
                        value={settings.smtp.port}
                        onChange={(e) =>
                          updateSetting(
                            "smtp",
                            "port",
                            parseInt(e.target.value),
                          )
                        }
                        className="w-full border border-gray-200 dark:border-reply-border-dark bg-reply-bg dark:bg-black/20 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500/20 outline-none"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <label className="block text-xs font-bold text-gray-400 uppercase mb-2">
                    Usuario / Email
                  </label>
                  <input
                    type="text"
                    placeholder="usuario@dominio.com"
                    value={settings.smtp.user}
                    onChange={(e) =>
                      updateSetting("smtp", "user", e.target.value)
                    }
                    className="w-full border border-gray-200 dark:border-reply-border-dark bg-reply-bg dark:bg-black/20 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500/20 outline-none"
                  />
                </div>

                <div className="space-y-4">
                  <label className="block text-xs font-bold text-gray-400 uppercase mb-2">
                    Contraseña
                  </label>
                  <input
                    type="password"
                    placeholder="••••••••"
                    value={settings.smtp.password}
                    onChange={(e) =>
                      updateSetting("smtp", "password", e.target.value)
                    }
                    className="w-full border border-gray-200 dark:border-reply-border-dark bg-reply-bg dark:bg-black/20 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500/20 outline-none"
                  />
                </div>

                <div className="col-span-1 md:col-span-2 border-t border-gray-100 dark:border-reply-border-dark pt-5 mt-2">
                  <h4 className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-4 uppercase tracking-tighter">
                    Identidad del Remitente
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-gray-400 uppercase mb-2">
                        Nombre a Mostrar
                      </label>
                      <input
                        type="text"
                        placeholder="Replie Soporte"
                        value={settings.smtp.senderName}
                        onChange={(e) =>
                          updateSetting("smtp", "senderName", e.target.value)
                        }
                        className="w-full border border-gray-200 dark:border-reply-border-dark bg-reply-bg dark:bg-black/20 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500/20 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-400 uppercase mb-2">
                        Email Remitente
                      </label>
                      <input
                        type="email"
                        placeholder="noreply@tuempresa.com"
                        value={settings.smtp.senderEmail}
                        onChange={(e) =>
                          updateSetting("smtp", "senderEmail", e.target.value)
                        }
                        className="w-full border border-gray-200 dark:border-reply-border-dark bg-reply-bg dark:bg-black/20 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500/20 outline-none"
                      />
                    </div>
                  </div>
                </div>

                {/* Test Connection Button */}
                <div className="col-span-1 md:col-span-2 flex justify-center pt-4">
                  <button
                    onClick={handleTestEmail}
                    disabled={testingConnection}
                    className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold transition-all ${testingConnection ? "bg-gray-100 text-gray-400 cursor-not-allowed" : "bg-indigo-50 text-indigo-600 hover:bg-indigo-100"}`}
                  >
                    {testingConnection ? (
                      <div className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                    ) : (
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
                          d="M13 10V3L4 14h7v7l9-11h-7z"
                        />
                      </svg>
                    )}
                    <span>Probar Conexión SMTP</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        );

      case "security":
        return (
          <div className="bg-white dark:bg-reply-panel-dark p-6 md:p-10 rounded-2xl border border-gray-200 dark:border-reply-border-dark shadow-sm animate-fadeIn max-w-2xl mx-auto">
            <div className="flex flex-col items-center text-center mb-8">
              <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 text-red-600 rounded-2xl flex items-center justify-center mb-4">
                <svg
                  className="w-8 h-8"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                  />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-gray-800 dark:text-white">
                Seguridad de la Cuenta
              </h3>
              <p className="text-sm text-gray-500 mt-2 leading-relaxed">
                Protege el acceso a tu plataforma. Te recomendamos usar
                contraseñas fuertes y únicas.
              </p>
            </div>

            <div className="space-y-4 max-w-md mx-auto">
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase mb-2">
                  Contraseña Actual
                </label>
                <input
                  type="password"
                  placeholder="Contraseña Actual"
                  className="w-full border border-gray-200 dark:border-reply-border-dark bg-reply-bg dark:bg-black/20 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-red-500/20 focus:border-red-500 outline-none transition-all"
                  value={passwords.current}
                  onChange={(e) =>
                    setPasswords({ ...passwords, current: e.target.value })
                  }
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase mb-2">
                  Nueva Contraseña
                </label>
                <input
                  type="password"
                  placeholder="Mínimo 8 caracteres"
                  className="w-full border border-gray-200 dark:border-reply-border-dark bg-reply-bg dark:bg-black/20 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-red-500/20 focus:border-red-500 outline-none transition-all"
                  value={passwords.new}
                  onChange={(e) =>
                    setPasswords({ ...passwords, new: e.target.value })
                  }
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase mb-2">
                  Confirmar Nueva Contraseña
                </label>
                <input
                  type="password"
                  placeholder="Repite la contraseña"
                  className="w-full border border-gray-200 dark:border-reply-border-dark bg-reply-bg dark:bg-black/20 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-red-500/20 focus:border-red-500 outline-none transition-all"
                  value={passwords.confirm}
                  onChange={(e) =>
                    setPasswords({ ...passwords, confirm: e.target.value })
                  }
                />
              </div>

              <div className="pt-4">
                <button
                  disabled={loading || !passwords.new}
                  className={`w-full py-3 rounded-xl font-bold text-sm shadow-lg transition-all flex items-center justify-center gap-2 ${loading || !passwords.new ? "bg-gray-100 text-gray-400 cursor-not-allowed" : "bg-red-600 text-white hover:bg-red-700 active:scale-95 shadow-red-500/30"}`}
                  onClick={handleSave}
                >
                  {loading ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  ) : (
                    "Actualizar Contraseña"
                  )}
                </button>
              </div>

              <div className="p-4 bg-reply-bg dark:bg-gray-800/50 rounded-xl border border-gray-100 dark:border-reply-border-dark mt-6">
                <h4 className="text-[10px] font-bold text-gray-400 uppercase mb-2">
                  Tip de Seguridad
                </h4>
                <p className="text-[11px] text-gray-500 leading-tight italic">
                  "Usa una combinación de letras, números y caracteres
                  especiales. No compartas nunca tu contraseña con terceros."
                </p>
              </div>
            </div>
          </div>
        );

      case "sound":
        return <SoundSettings />;

      case "permissions":
        return <PermissionsPanel />;

      default:
        return null;
    }
  };

  return (
    <div className="h-full bg-reply-bg dark:bg-reply-bg-dark flex flex-col transition-colors duration-200">
      <ModuleHeader
        title="Configuración de Empresa"
        description="Gestiona tu perfil, horarios y automatizaciones."
        icon={
          <svg
            className="w-8 h-8 text-white"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
            />
          </svg>
        }
        gradient="from-indigo-600 to-blue-600 dark:from-indigo-800 dark:to-blue-800"
      />

      <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
        {/* Sidebar Tabs */}
        <div className="w-full md:w-64 bg-white dark:bg-reply-surface-dark border-b md:border-b-0 md:border-r border-gray-200 dark:border-reply-border-dark flex flex-row md:flex-col overflow-x-auto md:overflow-visible no-scrollbar shrink-0">
          <NavButton
            active={activeTab === "general"}
            onClick={() => setActiveTab("general")}
            icon={
              <path d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            }
            label="General"
          />
          <NavButton
            active={activeTab === "hours"}
            onClick={() => setActiveTab("hours")}
            icon={<path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />}
            label="Horarios"
          />
          <NavButton
            active={activeTab === "automation"}
            onClick={() => setActiveTab("automation")}
            icon={<path d="M13 10V3L4 14h7v7l9-11h-7z" />}
            label="Automatización"
          />
          <NavButton
            active={activeTab === "email"}
            onClick={() => setActiveTab("email")}
            icon={
              <path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            }
            label="Email"
            fullLabel="Email / SMTP"
          />
          <NavButton
            active={activeTab === "security"}
            onClick={() => setActiveTab("security")}
            icon={
              <path d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            }
            label="Seguridad"
          />
          <NavButton
            active={activeTab === "billing"}
            onClick={() => setActiveTab("billing")}
            icon={
              <path d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
            }
            label="Facturación"
          />
          <NavButton
            active={activeTab === "sound"}
            onClick={() => setActiveTab("sound")}
            icon={
              <path d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
            }
            label="Sonido"
          />
          <NavButton
            active={activeTab === "permissions"}
            onClick={() => setActiveTab("permissions")}
            icon={
              <path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            }
            label="Roles"
            fullLabel="Roles y Permisos"
          />
        </div>

        {/* Content Area */}
        {/* Content Area */}
        <div className="flex-1 flex flex-col min-w-0 bg-reply-bg dark:bg-reply-bg-dark">
          <div className="flex-1 overflow-y-auto p-4 md:p-8 relative scroll-smooth">
            <div className="max-w-4xl mx-auto pb-10">
              {renderTabContent()}

              {activeTab === "billing" && (
                <div className="space-y-6 animate-fadeIn">
                  {/* Plan Overview Card */}
                  <div className="bg-white dark:bg-reply-panel-dark p-8 rounded-xl border border-gray-200 dark:border-reply-border-dark shadow-sm text-center relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-4 opacity-10">
                      <svg
                        className="w-32 h-32 text-indigo-500"
                        fill="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path d="M12 2L2 7l10 5 10-5-10-5zm0 9l2.5-1.25L12 8.5l-2.5 1.25L12 11zm0 2.5l-5-2.5-5 2.5L12 22l10-8.5-5-2.5-5 2.5z" />
                      </svg>
                    </div>

                    <div className="relative z-10 flex flex-col md:flex-row items-center justify-between">
                      <div className="text-left mb-6 md:mb-0">
                        <div className="flex items-center gap-3 mb-2">
                          <div className="p-3 bg-indigo-100 dark:bg-indigo-900/50 rounded-lg text-2xl">
                            💎
                          </div>
                          <div>
                            <h3 className="text-2xl font-bold text-gray-800 dark:text-white leading-tight">
                              {settings.billing.plan?.name || "Plan Gratuito"}
                            </h3>
                            <div className="flex items-baseline gap-1">
                              <span className="text-3xl font-extrabold text-indigo-600 dark:text-indigo-400">
                                ${settings.billing.plan?.price || 0}
                              </span>
                              <span className="text-gray-500 font-medium">
                                /mes
                              </span>
                            </div>
                          </div>
                        </div>
                        <p className="text-gray-500 text-sm flex items-center gap-2">
                          <svg
                            className="w-4 h-4"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth="2"
                              d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                            ></path>
                          </svg>
                          Renovación:{" "}
                          <span className="font-bold text-gray-800 dark:text-gray-200">
                            {settings.billing.subscriptionEndsAt
                              ? new Date(
                                  settings.billing.subscriptionEndsAt,
                                ).toLocaleDateString("es-CO", {
                                  year: "numeric",
                                  month: "long",
                                  day: "numeric",
                                })
                              : "Mensual"}
                          </span>
                        </p>
                      </div>

                      {/* Stripe Promo */}
                      <div className="bg-gradient-to-r from-[#635BFF] to-[#635BFF]/80 p-5 rounded-xl text-white shadow-lg max-w-sm w-full">
                        <div className="flex justify-between items-start mb-2">
                          <span className="font-bold text-lg flex items-center gap-2">
                            Stripe{" "}
                            <span className="text-[10px] bg-white text-[#635BFF] px-1.5 py-0.5 rounded uppercase tracking-wider font-extrabold">
                              PRONTO
                            </span>
                          </span>
                          <svg
                            className="w-6 h-6 opacity-75"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth="2"
                              d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
                            ></path>
                          </svg>
                        </div>
                        <p className="text-white/90 text-sm leading-relaxed mb-3">
                          Pronto podrs vincular tu tarjeta para pagos
                          automticos y gestión de suscripciones sin
                          interrupciones.
                        </p>
                        <button
                          className="w-full py-2 bg-white text-[#635BFF] rounded-lg font-bold text-sm hover:bg-reply-bg transition-colors shadow-sm cursor-not-allowed opacity-80"
                          disabled
                        >
                          Notificarme cuando estáé listo
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Limits & Usage Grid */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Resource Usage */}
                    <div className="bg-white dark:bg-reply-panel-dark p-6 rounded-xl border border-gray-200 dark:border-reply-border-dark shadow-sm">
                      <h4 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-6 flex items-center gap-2">
                        <svg
                          className="w-4 h-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                          ></path>
                        </svg>
                        Consumo de Recursos
                      </h4>

                      <div className="space-y-6">
                        {[
                          {
                            label: "Usuarios / Agentes",
                            current: planData?.usage.users || 0,
                            max: planData?.plan.limits.max_users,
                            percent: planData?.percentages.users,
                          },
                          {
                            label: "Conexiones WhatsApp",
                            current: planData?.usage.whatsapp_sessions || 0,
                            max: planData?.plan.limits.max_whatsapp_sessions,
                            percent: planData?.percentages.whatsapp_sessions,
                          },
                          {
                            label: "Contactos (CRM)",
                            current: planData?.usage.contacts || 0,
                            max: planData?.plan.limits.max_contacts,
                            percent: planData?.percentages.contacts,
                          },
                          {
                            label: "Workflows Activos",
                            current: planData?.usage.workflows || 0,
                            max: planData?.plan.limits.max_workflows,
                            percent: planData?.percentages.workflows,
                          },
                          {
                            label: "Almacenamiento (Archivos)",
                            current:
                              (planData?.usage.storage_bytes
                                ? (
                                    planData.usage.storage_bytes /
                                    (1024 * 1024 * 1024)
                                  ).toFixed(2)
                                : "0") + " GB",
                            max: planData?.plan.limits.storage_limit_gb
                              ? planData.plan.limits.storage_limit_gb + " GB"
                              : "∞",
                            percent: planData?.percentages.storage,
                            isStorage: true,
                          },
                        ].map((item, i) => (
                          <div key={i}>
                            <div className="flex justify-between text-sm mb-1">
                              <span className="text-gray-600 dark:text-gray-400 font-medium">
                                {item.label}
                              </span>
                              <span className="font-bold text-gray-800 dark:text-white">
                                {item.isStorage ? item.current : item.current}
                                <span className="text-gray-400 font-normal mx-1">
                                  /
                                </span>
                                {!item.max || item.max === -1 ? "∞" : item.max}
                              </span>
                            </div>
                            <div className="w-full bg-gray-100 dark:bg-gray-700/50 rounded-full h-2.5 overflow-hidden">
                              <div
                                className={`h-2.5 rounded-full transition-all duration-500 ${
                                  (item.percent || 0) > 90
                                    ? "bg-red-500"
                                    : (item.percent || 0) > 75
                                      ? "bg-yellow-500"
                                      : "bg-indigo-600"
                                }`}
                                style={{
                                  width: `${Math.min(item.percent || 0, 100)}%`,
                                }}
                              ></div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Included Features */}
                    <div className="bg-white dark:bg-reply-panel-dark p-6 rounded-xl border border-gray-200 dark:border-reply-border-dark shadow-sm h-full">
                      <h4 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-6 flex items-center gap-2">
                        <svg
                          className="w-4 h-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                          ></path>
                        </svg>
                        Alcance del Plan
                      </h4>
                      <div className="space-y-3">
                        {[
                          {
                            name: "Motor de Inteligencia Artificial",
                            icon: "⚡",
                            enabled:
                              (planData?.plan.limits.max_ai_assistants || 0) >
                              0,
                          },
                          {
                            name: "API Access & Webhooks",
                            icon: "🔌",
                            enabled: true,
                          },
                          {
                            name: "Marca Blanca (White Label)",
                            icon: "🏷️",
                            enabled: true,
                          },
                          {
                            name: "Soporte Prioritario",
                            icon: "🛟",
                            enabled: true,
                          },
                          {
                            name: "Reportes Avanzados",
                            icon: "📊",
                            enabled: true,
                          },
                        ].map((feature, i) => (
                          <div
                            key={i}
                            className={`flex items-center justify-between p-3 rounded-lg border ${feature.enabled ? "bg-reply-bg dark:bg-gray-800/30 border-gray-100 dark:border-reply-border-dark" : "bg-reply-bg opacity-50 border-transparent"}`}
                          >
                            <div className="flex items-center gap-3">
                              <span className="text-xl">{feature.icon}</span>
                              <span className="font-medium text-gray-700 dark:text-gray-300 transform translate-y-px">
                                {feature.name}
                              </span>
                            </div>
                            {feature.enabled ? (
                              <span className="text-xs font-bold text-green-600 bg-green-100 dark:bg-green-900/30 dark:text-green-400 px-2.5 py-1 rounded-full flex items-center gap-1">
                                ✓ Incluido
                              </span>
                            ) : (
                              <span className="text-xs font-bold text-gray-500 bg-gray-200 px-2 py-1 rounded-full">
                                No incluido
                              </span>
                            )}
                          </div>
                        ))}

                        <div className="mt-6 pt-4 border-t border-gray-100 dark:border-reply-border-dark text-center">
                          <p className="text-xs text-gray-500 mb-2">
                            ¿Necesitas ms capacidad?
                          </p>
                          <button className="text-indigo-600 dark:text-indigo-400 font-bold text-sm hover:underline">
                            Contactar Ventas
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Payment Methods Section (Manual Fallback) */}
                  <div
                    id="payment-methods"
                    className="bg-reply-bg dark:bg-reply-surface-dark p-6 rounded-xl border border-gray-200 dark:border-reply-border-dark text-left"
                  >
                    <h4 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-4 flex items-center justify-between">
                      Métodos de Pago Manuales
                      <span className="text-[10px] bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded font-bold">
                        TEMPORAL
                      </span>
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="bg-white dark:bg-reply-panel-dark p-4 rounded-lg border border-gray-100 dark:border-reply-border-dark shadow-sm">
                        <h5 className="font-bold text-[#E90772] mb-1 flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-[#E90772]"></span>{" "}
                          Nequi
                        </h5>
                        <p className="font-mono text-lg text-gray-800 dark:text-white tracking-wide">
                          322 901 2685
                        </p>
                      </div>
                      <div className="bg-white dark:bg-reply-panel-dark p-4 rounded-lg border border-gray-100 dark:border-reply-border-dark shadow-sm">
                        <h5 className="font-bold text-[#FF0000] mb-1 flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-[#FF0000]"></span>{" "}
                          Daviplata
                        </h5>
                        <p className="font-mono text-lg text-gray-800 dark:text-white tracking-wide">
                          324 245 0628
                        </p>
                      </div>
                      <div className="bg-white dark:bg-reply-panel-dark p-4 rounded-lg border border-gray-100 dark:border-reply-border-dark shadow-sm">
                        <h5 className="font-bold text-purple-600 mb-1 flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-purple-600"></span>{" "}
                          Bre-B
                        </h5>
                        <p className="font-mono text-lg text-gray-800 dark:text-white tracking-wide">
                          324 245 0628
                        </p>
                      </div>
                    </div>
                    <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-600 text-xs text-center text-gray-500 flex items-center justify-center gap-2">
                      <svg
                        className="w-4 h-4 text-blue-500"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                          d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                        ></path>
                      </svg>
                      Envía tu comprobante a soporte para activar tu renovación
                      inmediatamente.
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Fixed Footer Bar - Responsive */}
          <div className="bg-white/80 dark:bg-reply-surface-dark/80 backdrop-blur-md p-4 md:p-5 border-t border-gray-200 dark:border-reply-border-dark flex justify-center md:justify-end items-center shadow-[0_-10px_30px_rgba(0,0,0,0.05)] z-20 sticky bottom-0">
            <button
              onClick={handleSave}
              disabled={loading}
              className="w-full md:w-auto bg-indigo-600 text-white px-10 py-3 rounded-2xl font-bold shadow-xl shadow-indigo-500/30 hover:bg-indigo-700 active:scale-95 transition-all flex items-center justify-center gap-3 text-sm md:text-base group"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
              ) : (
                <>
                  <svg
                    className="w-5 h-5 group-hover:rotate-12 transition-transform"
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
                  <span>Guardar Cambios</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
      <AvatarPickerModal />
    </div>
  );
};

const NavButton: React.FC<{
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  fullLabel?: string;
}> = ({ active, onClick, icon, label, fullLabel }) => (
  <button
    onClick={onClick}
    className={`flex-none md:w-full flex items-center justify-center md:justify-start gap-3 px-5 md:px-6 py-4 transition-all border-b-2 md:border-b-0 md:border-l-4 whitespace-nowrap ${
      active
        ? "bg-indigo-50 dark:bg-indigo-900/10 text-indigo-600 dark:text-indigo-400 border-indigo-600 font-bold"
        : "text-gray-500 dark:text-gray-400 hover:bg-reply-bg dark:hover:bg-gray-800 border-transparent hover:text-gray-700 dark:hover:text-gray-200"
    }`}
  >
    <svg
      className={`w-5 h-5 shrink-0 ${active ? "text-indigo-600 dark:text-indigo-400" : "text-gray-400"}`}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      {icon}
    </svg>
    <span className="text-sm md:hidden">{label}</span>
    <span className="text-sm hidden md:block">{fullLabel || label}</span>
  </button>
);



