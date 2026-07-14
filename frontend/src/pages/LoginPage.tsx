import React, { useState, useEffect } from "react";
import { useForm, UseFormRegister, FieldErrors, Path } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { toast, Toaster } from "sonner";
import { AxiosError } from "axios";
import { motion, AnimatePresence } from "framer-motion";

import { useAuthStore } from "@/stores/authStore";
import { api } from "@/lib/axios";
import { ApiResponse } from "@/types/common.types";
import { LoginResponse } from "@/types/auth.types";
import { API_BASE_URL } from "@/services/apiConfig";
import { PWAInstallPrompt } from "@/components/PWAInstallPrompt";

//  VALIDATION SCHEMAS
const loginSchema = z.object({
  email: z.string().min(1, "El email es requerido").email("Email inválido"),
  password: z.string().min(6, "La contraseña debe tener al menos 6 caracteres"),
});

const registerSchema = z.object({
  companyName: z
    .string()
    .min(2, "El nombre de la empresa debe tener al menos 2 caracteres")
    .max(100, "El nombre de la empresa es muy largo"),
  adminEmail: z
    .string()
    .min(1, "El email es requerido")
    .email("Por favor, proporciona un email válido"),
  adminPassword: z
    .string()
    .min(8, "La contraseña debe tener al menos 8 caracteres")
    .regex(/[A-Z]/, "Debe contener al menos una mayúscula")
    .regex(/[a-z]/, "Debe contener al menos una minúscula")
    .regex(/[0-9]/, "Debe contener al menos un número"),
  slug: z.string().optional(),
});

type LoginFormData = z.infer<typeof loginSchema>;
type RegisterFormData = z.infer<typeof registerSchema>;

//  REUSABLE COMPONENT: INPUT FIELD
interface FormInputProps {
  label: string;
  name: string;
  type?: string;
  placeholder?: string;
  register: UseFormRegister<any>;
  error?: any;
  togglePassword?: boolean;
}

const FormInput = ({
  label,
  name,
  type = "text",
  placeholder,
  register,
  error,
  togglePassword,
}: FormInputProps) => {
  const [show, setShow] = useState(false);
  const isPassword = togglePassword && type === "password";
  const effectiveType = isPassword ? (show ? "text" : "password") : type;

  return (
    <div className="space-y-1">
      <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5 ml-0.5">
        {label}
      </label>
      <div className="relative group">
        <input
          type={effectiveType}
          {...register(name)}
          placeholder={placeholder}
          className={`
            block w-full px-4 py-3 rounded-xl border-0 text-sm font-medium transition-all duration-200
            bg-gray-50/80 dark:bg-gray-800/60 text-gray-900 dark:text-gray-100
            placeholder-gray-400 dark:placeholder-gray-600
            ring-1 ring-inset
            ${
              error
                ? "ring-red-400/50 bg-red-50/30 dark:bg-red-950/10 focus:ring-red-500"
                : "ring-gray-200/60 dark:ring-gray-700/40 hover:ring-gray-300/80 dark:hover:ring-gray-600/60 focus:ring-2 focus:ring-reply-brand/40"
            }
            focus:outline-none focus:bg-white dark:focus:bg-gray-800
          `}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setShow(!show)}
            className="absolute inset-y-0 right-0 pr-4 flex items-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors cursor-pointer"
          >
            {show ? (
              <svg
                className="w-5 h-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
                />
              </svg>
            ) : (
              <svg
                className="w-5 h-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                />
              </svg>
            )}
          </button>
        )}
      </div>
      {error && (
        <p className="mt-1.5 text-xs font-medium text-red-500 flex items-center gap-1 ml-1 animate-fade-in">
          <svg
            className="w-3 h-3"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          {String(error.message)}
        </p>
      )}
    </div>
  );
};


export const LoginPage = () => {
  const { login } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const from =
    (location.state as { from?: { pathname?: string } })?.from?.pathname ||
    "/dashboard";

  // UI State
  const [darkMode, setDarkMode] = useState(false);
  const [blockedStatus, setBlockedStatus] = useState<string | null>(null);
  const [isRegisterMode, setIsRegisterMode] = useState(false);

  // Forms
  const loginForm = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const registerForm = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
    defaultValues: { companyName: "", adminEmail: "", adminPassword: "", slug: "" },
  });

  // Watch company name to suggest slug
  const watchedCompanyName = registerForm.watch("companyName");
  useEffect(() => {
    if (watchedCompanyName) {
      const suggestedSlug = watchedCompanyName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");
      registerForm.setValue("slug", suggestedSlug);
    }
  }, [watchedCompanyName]);

  // Check for Token from Google Login Redirect
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");
    const errorParam = params.get("error");

    if (token) {
      const fetchGoogleUser = async () => {
        try {
          // Set token locally for Axios interceptor
          localStorage.setItem("token", token);

          // Fetch hydrated user info from profile endpoint, passing token explicitly
          const response = await api.get<{ user: any }>("/users/me", {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          });
          const user = response.data?.user;

          if (!user) {
            throw new Error("No se pudo obtener el perfil de usuario");
          }

          // Sync Dates
          const mappedUser = {
            ...user,
            createdAt: user.createdAt ? new Date(user.createdAt) : new Date(),
            updatedAt: user.updatedAt ? new Date(user.updatedAt) : new Date(),
            company: user.company
              ? {
                  ...user.company,
                  createdAt: new Date(user.company.createdAt),
                  updatedAt: new Date(user.company.updatedAt),
                  subscriptionEndsAt: user.company.subscriptionEndsAt
                    ? new Date(user.company.subscriptionEndsAt)
                    : null,
                }
              : undefined,
          };

          // @ts-ignore
          login(mappedUser, token);
          toast.success(`Bienvenido, ${user.name.split(" ")[0]}`);

          // Clean URL parameters
          window.history.replaceState({}, document.title, window.location.pathname);
          navigate("/dashboard", { replace: true });
        } catch (err) {
          console.error("[LoginPage] Google Token Fetch Error:", err);
          localStorage.removeItem("token");
          toast.error("Error con Google");
        }
      };

      fetchGoogleUser();
    } else if (errorParam) {
      if (errorParam === "no_email") {
        toast.error("Email no disponible");
      } else if (errorParam === "auth_failed") {
        toast.error("Error de autenticación");
      } else {
        toast.error("Error con Google");
      }
      // Clean URL parameters
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  // Dark Mode Sync
  useEffect(() => {
    if (darkMode) document.documentElement.classList.add("dark");
    else document.documentElement.classList.remove("dark");
  }, [darkMode]);

  const onSubmitLogin = async (data: LoginFormData) => {
    try {
      const response = await api.post<ApiResponse<LoginResponse>>(
        "/auth/login",
        data,
      );

      const { token, data: responseData } = response.data;
      const user = responseData?.user;

      if (!token || !user) {
        throw new Error(
          "Respuesta inválida del servidor (Falta token o usuario)",
        );
      }

      // [SYNC] DATA MAPPING: Convert ISO strings to Date objects to satisfy Store types
      const mappedUser = {
        ...user,
        createdAt: new Date(user.createdAt),
        updatedAt: new Date(user.updatedAt),
        company: user.company
          ? {
              ...user.company,
              createdAt: new Date(user.company.createdAt),
              updatedAt: new Date(user.company.updatedAt),
              subscriptionEndsAt: user.company.subscriptionEndsAt
                ? new Date(user.company.subscriptionEndsAt)
                : null,
            }
          : undefined,
      };

      // @ts-ignore - Explicit mapping above handles the Date/String mismatch
      login(mappedUser, token);
      toast.success(`Bienvenido de nuevo, ${user.name.split(" ")[0]}`);
      navigate(from, { replace: true });
    } catch (error: unknown) {
      console.error("[LoginPage] Login Error:", error);

      if (error instanceof AxiosError) {
        console.log("[LoginPage] Axios Response:", error.response);

        if (error.response?.status === 429) {
          toast.error("Demasiados intentos");
        } else if (error.response?.status === 401) {
          //  SHOW SPECIFIC INVALID CREDENTIALS MESSAGE
          const serverMsg = error.response.data?.message;
          const displayMsg =
            typeof serverMsg === "string"
              ? serverMsg
              : "Email o contraseña incorrectos";
          console.log("[LoginPage] Displaying Toast:", displayMsg);
          toast.error(displayMsg);
        } else if (
          error.response?.status === 403 &&
          typeof error.response.data?.message === "string" &&
          error.response.data.message.includes("Acceso denegado")
        ) {
          const msg = error.response.data.message;
          const match = msg.match(/estado (\w+)/);
          setBlockedStatus(match ? match[1] : "SUSPENDED");
        } else {
          toast.error(
            error.response?.data?.message || "Error al iniciar sesión",
          );
        }
      } else {
        toast.error((error as Error).message || "Error desconocido");
      }
    }
  };

  const handleGoogleRegister = (e: React.MouseEvent) => {
    e.preventDefault();
    const companyName = registerForm.getValues("companyName");
    const slug = registerForm.getValues("slug") || "";

    if (!companyName || companyName.trim().length < 2) {
      registerForm.setError("companyName", {
        type: "manual",
        message: "Por favor, ingresa el nombre de tu empresa primero.",
      });
      return;
    }

    window.location.href = `${API_BASE_URL}/google/auth?action=login&companyName=${encodeURIComponent(companyName)}&slug=${encodeURIComponent(slug)}`;
  };

  const onSubmitRegister = async (data: RegisterFormData) => {
    try {
      const response = await api.post<ApiResponse<LoginResponse>>("/onboarding", {
        companyName: data.companyName,
        adminEmail: data.adminEmail,
        adminPassword: data.adminPassword,
        slug: data.slug,
        plan: "free",
      });

      const { token, data: responseData } = response.data;
      const user = responseData?.user;

      if (!token || !user) {
        throw new Error(
          "Respuesta inválida del servidor (Falta token o usuario)",
        );
      }

      // [SYNC] DATA MAPPING: Convert ISO strings to Date objects to satisfy Store types
      const mappedUser = {
        ...user,
        createdAt: new Date(user.createdAt),
        updatedAt: new Date(user.updatedAt),
        company: user.company
          ? {
              ...user.company,
              createdAt: new Date(user.company.createdAt),
              updatedAt: new Date(user.company.updatedAt),
              subscriptionEndsAt: user.company.subscriptionEndsAt
                ? new Date(user.company.subscriptionEndsAt)
                : null,
            }
          : undefined,
      };

      // @ts-ignore - Explicit mapping above handles the Date/String mismatch
      login(mappedUser, token);
      toast.success(`Bienvenido, ${user.name.split(" ")[0]}`);
      navigate("/dashboard", { replace: true });
    } catch (error: any) {
      console.error("[LoginPage] Register Error:", error);
      const msg = error.response?.data?.message || "Error al registrar la empresa";
      toast.error(msg);
    }
  };


  return (
    <div className="flex min-h-screen bg-gray-50 dark:bg-reply-bg-dark font-sans selection:bg-reply-brand/10 dark:selection:bg-reply-brand/20 relative">
      <Toaster
        position="top-right"
        theme="dark"
        gap={6}
        toastOptions={{ duration: 3000, closeButton: true }}
      />
      {/* ️ LEFT SIDE: ARTWORK & BRANDING — Enterprise Grade */}
      <div className="hidden lg:flex w-[48%] fixed inset-y-0 left-0 bg-gradient-to-br from-[#0b3c2c] via-[#051c15] to-[#010906] items-center justify-center p-12 overflow-hidden z-0">
        {/* ═══ LAYER 1: Animated Gradient Mesh ═══ */}
        <div className="absolute inset-0">
          <motion.div
            className="absolute inset-0 opacity-30"
            animate={{
              background: [
                "radial-gradient(ellipse at 20% 50%, rgba(16,185,129,0.15) 0%, transparent 50%)",
                "radial-gradient(ellipse at 80% 20%, rgba(20,184,166,0.12) 0%, transparent 50%)",
                "radial-gradient(ellipse at 40% 80%, rgba(5,150,105,0.15) 0%, transparent 50%)",
                "radial-gradient(ellipse at 20% 50%, rgba(16,185,129,0.15) 0%, transparent 50%)",
              ],
            }}
            transition={{ duration: 12, repeat: Infinity, ease: "linear" }}
          />
        </div>

        {/* ═══ LAYER 2: Fine Technical Grid ═══ */}
        <div className="absolute inset-0 opacity-[0.06] bg-[linear-gradient(to_right,#80808020_1px,transparent_1px),linear-gradient(to_bottom,#80808020_1px,transparent_1px)] [background-size:40px_40px]" />

        {/* ═══ LAYER 3: Floating Luminous Orbs ═══ */}
        {[
          { size: 320, x: [-60, 80, -20, -60], y: [-40, 20, 60, -40], color: "emerald", opacity: 0.08, dur: 20 },
          { size: 200, x: [200, 120, 260, 200], y: [300, 200, 350, 300], color: "teal", opacity: 0.06, dur: 25 },
          { size: 150, x: [400, 350, 450, 400], y: [-50, 30, -30, -50], color: "cyan", opacity: 0.05, dur: 18 },
          { size: 180, x: [100, 200, 50, 100], y: [400, 350, 500, 400], color: "emerald", opacity: 0.07, dur: 22 },
        ].map((orb, i) => (
          <motion.div
            key={`orb-${i}`}
            className={`absolute rounded-full blur-[80px] bg-${orb.color}-500`}
            style={{ width: orb.size, height: orb.size, opacity: orb.opacity }}
            animate={{ x: orb.x, y: orb.y }}
            transition={{ duration: orb.dur, repeat: Infinity, ease: "easeInOut" }}
          />
        ))}

        {/* ═══ LAYER 4: Scanning Line (Cyber/Enterprise feel) ═══ */}
        <motion.div
          className="absolute left-0 right-0 h-px bg-gradient-to-r from-transparent via-emerald-400/30 to-transparent"
          animate={{ top: ["-5%", "105%"] }}
          transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
        />

        {/* ═══ CONTENT: Staggered Enterprise Reveal ═══ */}
        <motion.div
          initial="hidden"
          animate="visible"
          variants={{
            hidden: {},
            visible: { transition: { staggerChildren: 0.15, delayChildren: 0.3 } },
          }}
          className="z-10 text-center text-white max-w-xl"
        >
          {/* Logo with Radial Pulse */}
          <motion.div
            variants={{ hidden: { opacity: 0, scale: 0.8, y: 20 }, visible: { opacity: 1, scale: 1, y: 0 } }}
            transition={{ type: "spring", stiffness: 100, damping: 15 }}
            className="mb-8 flex justify-center relative"
          >
            {/* Animated radial pulse behind logo */}
            <motion.div
              className="absolute inset-0 bg-emerald-500/20 blur-3xl rounded-full scale-150"
              animate={{ opacity: [0.15, 0.35, 0.15], scale: [1.3, 1.6, 1.3] }}
              transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
            />
            <motion.svg
              whileHover={{ scale: 1.08, rotate: 3, filter: "drop-shadow(0 0 20px rgba(16,185,129,0.5))" }}
              whileTap={{ scale: 0.95 }}
              viewBox="0 0 100 100"
              fill="none"
              className="w-24 h-24 relative cursor-pointer"
              transition={{ type: "spring", stiffness: 300, damping: 15 }}
            >
              <path
                d="M25 65C25 51.19 36.19 40 50 40H60C62.76 40 65 42.24 65 45V65C65 78.81 53.81 90 40 90H25V65Z"
                className="fill-white"
              />
              <path
                d="M40 50C40 36.19 51.19 25 65 25H75L90 10L85 50H75C72.24 50 70 52.24 70 55V60C70 68.28 63.28 75 55 75H40V50Z"
                className="fill-emerald-400"
              />
            </motion.svg>
          </motion.div>

          {/* Title with Gradient Reveal */}
          <motion.h1
            variants={{ hidden: { opacity: 0, y: 15 }, visible: { opacity: 1, y: 0 } }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="text-4xl font-extrabold mb-4 tracking-tight drop-shadow-sm bg-gradient-to-r from-white via-gray-100 to-gray-300 bg-clip-text text-transparent"
          >
            Sentry CRM
          </motion.h1>

          {/* Tagline with Stagger */}
          <motion.p
            variants={{ hidden: { opacity: 0, y: 10 }, visible: { opacity: 1, y: 0 } }}
            transition={{ duration: 0.5 }}
            className="text-lg text-emerald-100/90 font-medium leading-relaxed max-w-md mx-auto"
          >
            La plataforma definitiva de <br />
            <span className="text-white font-semibold">Mensajería Inteligente & IA</span> para escalar las operaciones comerciales de tu negocio.
          </motion.p>

          {/* ═══ Trust Badges — Animated ═══ */}
          <motion.div
            variants={{ hidden: { opacity: 0, y: 10 }, visible: { opacity: 0.7, y: 0 } }}
            transition={{ duration: 0.5 }}
            className="mt-14 flex items-center justify-center gap-6"
          >
            {[
              {
                label: "Enterprise Grade",
                icon: (
                  <svg className="w-5 h-5 text-emerald-400" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                ),
              },
              {
                label: "SLA del 99.9%",
                icon: (
                  <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                ),
              },
            ].map((badge, i) => (
              <React.Fragment key={badge.label}>
                {i > 0 && <div className="h-4 w-px bg-white/20" />}
                <motion.div
                  className="flex items-center gap-2 cursor-default"
                  whileHover={{ scale: 1.05, opacity: 1 }}
                  transition={{ type: "spring", stiffness: 400, damping: 20 }}
                >
                  {badge.icon}
                  <span className="text-xs font-semibold uppercase tracking-wider">{badge.label}</span>
                </motion.div>
              </React.Fragment>
            ))}
          </motion.div>
        </motion.div>
      </div>

      {/* [AUTH] RIGHT SIDE: LOGIN FORM */}
      <div className="flex-1 lg:ml-[48%] flex flex-col justify-start px-6 sm:px-16 xl:px-28 pb-8 relative bg-white dark:bg-reply-bg-dark min-h-screen overflow-y-auto">
        {/* Subtle grid pattern for light and dark modes on right panel */}
        <div className="absolute inset-0 opacity-[0.03] dark:opacity-[0.05] pointer-events-none bg-[radial-gradient(#808080_1px,transparent_1px)] [background-size:24px_24px] z-0" />

        {/* ═══ MOBILE: Animated Gradient Header (replaces left panel on small screens) ═══ */}
        <div className="lg:hidden absolute top-0 left-0 right-0 h-32 overflow-hidden z-0">
          <div className="absolute inset-0 bg-gradient-to-b from-emerald-600/5 via-teal-500/3 to-transparent dark:from-emerald-500/10 dark:via-teal-500/5 dark:to-transparent" />
          <motion.div
            className="absolute w-40 h-40 rounded-full blur-[60px] bg-emerald-500/10 -top-10 -left-10"
            animate={{ x: [0, 60, 0], opacity: [0.08, 0.15, 0.08] }}
            transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
          />
          <motion.div
            className="absolute w-32 h-32 rounded-full blur-[50px] bg-teal-500/8 -top-5 right-10"
            animate={{ x: [0, -40, 0], opacity: [0.06, 0.12, 0.06] }}
            transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
          />
        </div>

        {/* Theme Toggle with micro-animation */}
        <motion.button
          onClick={() => setDarkMode(!darkMode)}
          className="absolute top-6 right-6 p-2 rounded-xl text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800/60 transition-all z-20 border border-gray-100 dark:border-gray-800/40"
          aria-label="Toggle Theme"
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9, rotate: 15 }}
          transition={{ type: "spring", stiffness: 400, damping: 17 }}
        >
          <AnimatePresence mode="wait">
            {darkMode ? (
              <motion.svg
                key="sun"
                initial={{ rotate: -90, opacity: 0 }}
                animate={{ rotate: 0, opacity: 1 }}
                exit={{ rotate: 90, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.5}
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
                />
              </motion.svg>
            ) : (
              <motion.svg
                key="moon"
                initial={{ rotate: 90, opacity: 0 }}
                animate={{ rotate: 0, opacity: 1 }}
                exit={{ rotate: -90, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.5}
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
                />
              </motion.svg>
            )}
          </AnimatePresence>
        </motion.button>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 80, damping: 18, delay: 0.1 }}
          className="w-full max-w-[400px] mx-auto pt-8 pb-10 z-10 flex flex-col my-auto"
        >
          {/* Header */}
          <div className="mb-8 text-center lg:text-left">
            <div className="inline-block lg:hidden mb-5">
              {/* Mobile Logo */}
              <svg viewBox="0 0 100 100" fill="none" className="w-11 h-11 mx-auto lg:mx-0">
                <path
                  d="M25 65C25 51.19 36.19 40 50 40H60C62.76 40 65 42.24 65 45V65C65 78.81 53.81 90 40 90H25V65Z"
                  className="fill-reply-brand"
                />
                <path
                  d="M40 50C40 36.19 51.19 25 65 25H75L90 10L85 50H75C72.24 50 70 52.24 70 55V60C70 68.28 63.28 75 55 75H40V50Z"
                  className="fill-green-200"
                />
              </svg>
            </div>
            <h2 className="text-2xl font-extrabold text-gray-900 dark:text-white mb-1.5 tracking-tight">
              {isRegisterMode ? "Crear una Cuenta" : "Iniciar Sesión"}
            </h2>
            <p className="text-[13px] font-medium text-gray-400 dark:text-gray-500">
              {isRegisterMode
                ? "Registra tu empresa y empieza a gestionar tus chats con IA."
                : "Accede a tu panel de control empresarial."}
            </p>
          </div>

          {/* Unified Sliding Tabs Switcher (Premium HSL style with Framer Motion layoutId sliding pill) */}
          <div className="bg-gray-100/50 dark:bg-gray-800/30 p-1 rounded-xl flex items-center mb-6 relative">
            <button
              type="button"
              onClick={() => setIsRegisterMode(false)}
              className={`relative flex-1 py-2.5 text-xs font-bold rounded-[10px] transition-colors duration-200 z-10 ${
                !isRegisterMode
                  ? "text-gray-900 dark:text-white"
                  : "text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
              }`}
            >
              {!isRegisterMode && (
                <motion.div
                  layoutId="activeTabBubble"
                  className="absolute inset-0 bg-white dark:bg-gray-800 rounded-[10px] shadow-sm z-0"
                  transition={{ type: "spring", stiffness: 380, damping: 30 }}
                />
              )}
              <span className="relative z-10">Iniciar Sesión</span>
            </button>
            <button
              type="button"
              onClick={() => setIsRegisterMode(true)}
              className={`relative flex-1 py-2.5 text-xs font-bold rounded-[10px] transition-colors duration-200 z-10 ${
                isRegisterMode
                  ? "text-gray-900 dark:text-white"
                  : "text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
              }`}
            >
              {isRegisterMode && (
                <motion.div
                  layoutId="activeTabBubble"
                  className="absolute inset-0 bg-white dark:bg-gray-800 rounded-[10px] shadow-sm z-0"
                  transition={{ type: "spring", stiffness: 380, damping: 30 }}
                />
              )}
              <span className="relative z-10">Registrar Empresa</span>
            </button>
          </div>

          <AnimatePresence mode="wait">
            {!isRegisterMode ? (
              <motion.div
                key="login"
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 12 }}
                transition={{ duration: 0.2, ease: "easeInOut" }}
              >
                {/* Google Login (Only in Sign In) */}
                <div className="mb-5">
                  <motion.a
                    whileHover={{ scale: 1.01, y: -0.5 }}
                    whileTap={{ scale: 0.99 }}
                    href={`${API_BASE_URL}/google/auth?action=login`}
                    className="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-xl bg-gray-50/80 dark:bg-gray-800/50 hover:bg-gray-100/80 dark:hover:bg-gray-800/80 transition-all duration-200 group ring-1 ring-inset ring-gray-200/50 dark:ring-gray-700/30"
                  >
                    <svg
                      className="w-[18px] h-[18px] group-hover:scale-105 transition-transform"
                      viewBox="0 0 24 24"
                      width="24"
                      height="24"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <g transform="matrix(1, 0, 0, 1, 27.009001, -39.238998)">
                        <path
                          fill="#4285F4"
                          d="M -3.264 51.509 C -3.264 50.719 -3.334 49.969 -3.454 49.239 L -14.754 49.239 L -14.754 53.749 L -8.284 53.749 C -8.574 55.229 -9.424 56.479 -10.684 57.329 L -10.684 60.329 L -6.824 60.329 C -4.564 58.239 -3.264 55.159 -3.264 51.509 Z"
                        />
                        <path
                          fill="#34A853"
                          d="M -14.754 63.239 C -11.514 63.239 -8.804 62.159 -6.824 60.329 L -10.684 57.329 C -11.764 58.049 -13.134 58.489 -14.754 58.489 C -17.884 58.489 -20.534 56.379 -21.484 53.529 L -25.464 53.529 L -25.464 56.619 C -23.494 60.539 -19.444 63.239 -14.754 63.239 Z"
                        />
                        <path
                          fill="#FBBC05"
                          d="M -21.484 53.529 C -21.734 52.809 -21.864 52.039 -21.864 51.239 C -21.864 50.439 -21.724 49.669 -21.484 48.949 L -21.484 45.859 L -25.464 45.859 C -26.284 47.479 -26.754 49.299 -26.754 51.239 C -26.754 53.179 -26.284 54.999 -25.464 56.619 L -21.484 53.529 Z"
                        />
                        <path
                          fill="#EA4335"
                          d="M -14.754 43.989 C -12.984 43.989 -11.404 44.599 -10.154 45.799 L -6.734 42.379 C -8.804 40.439 -11.514 39.239 -14.754 39.239 C -19.444 39.239 -23.494 41.939 -25.464 45.859 L -21.484 48.949 C -20.534 46.099 -17.884 43.989 -14.754 43.989 Z"
                        />
                      </g>
                    </svg>
                    <span className="text-sm font-semibold text-gray-600 dark:text-gray-300">
                      Continuar con Google
                    </span>
                  </motion.a>
                </div>

                {/* Divider */}
                <div className="relative mb-5">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-gray-100 dark:border-gray-800/60"></div>
                  </div>
                  <div className="relative flex justify-center">
                    <span className="px-4 bg-white dark:bg-reply-bg-dark text-[10px] font-semibold text-gray-300 dark:text-gray-600 uppercase tracking-[0.15em]">
                      o con tu email
                    </span>
                  </div>
                </div>

                {/* Login Form */}
                <form onSubmit={loginForm.handleSubmit(onSubmitLogin)} className="space-y-4">
                  <FormInput
                    label="Correo Electrónico"
                    name="email"
                    type="email"
                    placeholder="ej. nombre@empresa.com"
                    register={loginForm.register}
                    error={loginForm.formState.errors.email}
                  />

                  <div>
                    <FormInput
                      label="Contraseña"
                      name="password"
                      type="password"
                      placeholder="••••••••"
                      register={loginForm.register}
                      error={loginForm.formState.errors.password}
                      togglePassword={true}
                    />
                    <div className="flex justify-end mt-1.5">
                      <Link
                        to="/forgot-password"
                        className="text-xs font-semibold text-gray-400 hover:text-reply-brand dark:hover:text-teal-400 transition-colors"
                      >
                        ¿Olvidaste tu contraseña?
                      </Link>
                    </div>
                  </div>

                  <motion.button
                    whileHover={{ scale: 1.01, y: -0.5 }}
                    whileTap={{ scale: 0.99 }}
                    type="submit"
                    disabled={loginForm.formState.isSubmitting}
                    className="w-full py-3 bg-reply-brand hover:bg-reply-brand-dark text-white text-sm font-bold rounded-xl shadow-[0_2px_12px_rgba(16,185,129,0.25)] hover:shadow-[0_4px_20px_rgba(16,185,129,0.35)] hover:-translate-y-px transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed disabled:transform-none flex items-center justify-center gap-2"
                  >
                    {loginForm.formState.isSubmitting && (
                      <div className="animate-spin h-4 w-4 border-2 border-white/30 border-t-white rounded-full"></div>
                    )}
                    {loginForm.formState.isSubmitting ? "Iniciando Sesión..." : "Ingresar al Panel"}
                  </motion.button>
                </form>
              </motion.div>
            ) : (
              /* Registration Onboarding Form */
              <motion.div
                key="register"
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -12 }}
                transition={{ duration: 0.2, ease: "easeInOut" }}
                className="space-y-4"
              >
                <FormInput
                  label="Nombre de tu Empresa"
                  name="companyName"
                  placeholder="Ej. SkyCode Agency"
                  register={registerForm.register}
                  error={registerForm.formState.errors.companyName}
                />

                <div className="pt-2">
                  <motion.button
                    whileHover={{ scale: 1.01, y: -0.5 }}
                    whileTap={{ scale: 0.99 }}
                    type="button"
                    onClick={handleGoogleRegister}
                    className="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-xl bg-gray-50/80 dark:bg-gray-800/50 hover:bg-gray-100/80 dark:hover:bg-gray-800/80 transition-all duration-200 group cursor-pointer ring-1 ring-inset ring-gray-200/50 dark:ring-gray-700/30"
                  >
                    <svg
                      className="w-[18px] h-[18px] group-hover:scale-105 transition-transform"
                      viewBox="0 0 24 24"
                      width="24"
                      height="24"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <g transform="matrix(1, 0, 0, 1, 27.009001, -39.238998)">
                        <path
                          fill="#4285F4"
                          d="M -3.264 51.509 C -3.264 50.719 -3.334 49.969 -3.454 49.239 L -14.754 49.239 L -14.754 53.749 L -8.284 53.749 C -8.574 55.229 -9.424 56.479 -10.684 57.329 L -10.684 60.329 L -6.824 60.329 C -4.564 58.239 -3.264 55.159 -3.264 51.509 Z"
                        />
                        <path
                          fill="#34A853"
                          d="M -14.754 63.239 C -11.514 63.239 -8.804 62.159 -6.824 60.329 L -10.684 57.329 C -11.764 58.049 -13.134 58.489 -14.754 58.489 C -17.884 58.489 -20.534 56.379 -21.484 53.529 L -25.464 53.529 L -25.464 56.619 C -23.494 60.539 -19.444 63.239 -14.754 63.239 Z"
                        />
                        <path
                          fill="#FBBC05"
                          d="M -21.484 53.529 C -21.734 52.809 -21.864 52.039 -21.864 51.239 C -21.864 50.439 -21.724 49.669 -21.484 48.949 L -21.484 45.859 L -25.464 45.859 C -26.284 47.479 -26.754 49.299 -26.754 51.239 C -26.754 53.179 -26.284 54.999 -25.464 56.619 L -21.484 53.529 Z"
                        />
                        <path
                          fill="#EA4335"
                          d="M -14.754 43.989 C -12.984 43.989 -11.404 44.599 -10.154 45.799 L -6.734 42.379 C -8.804 40.439 -11.514 39.239 -14.754 39.239 C -19.444 39.239 -23.494 41.939 -25.464 45.859 L -21.484 48.949 C -20.534 46.099 -17.884 43.989 -14.754 43.989 Z"
                        />
                      </g>
                    </svg>
                    <span className="text-sm font-semibold text-gray-600 dark:text-gray-300">
                      Registrarme con Google
                    </span>
                  </motion.button>
                </div>

                {/* Divider */}
                <div className="relative my-4">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-gray-100 dark:border-gray-800/60"></div>
                  </div>
                  <div className="relative flex justify-center text-xs">
                    <span className="px-4 bg-white dark:bg-reply-bg-dark text-[10px] font-semibold text-gray-300 dark:text-gray-600 uppercase tracking-[0.15em]">
                      o crear credenciales directas
                    </span>
                  </div>
                </div>

                <form onSubmit={registerForm.handleSubmit(onSubmitRegister)} className="space-y-4">
                  <FormInput
                    label="Correo del Administrador"
                    name="adminEmail"
                    type="email"
                    placeholder="ej. nombre@empresa.com"
                    register={registerForm.register}
                    error={registerForm.formState.errors.adminEmail}
                  />

                  <FormInput
                    label="Contraseña de Administrador"
                    name="adminPassword"
                    type="password"
                    placeholder="Contraseña robusta"
                    register={registerForm.register}
                    error={registerForm.formState.errors.adminPassword}
                    togglePassword={true}
                  />

                  <motion.button
                    whileHover={{ scale: 1.01, y: -0.5 }}
                    whileTap={{ scale: 0.99 }}
                    type="submit"
                    disabled={registerForm.formState.isSubmitting}
                    className="w-full py-3 bg-reply-brand hover:bg-reply-brand-dark text-white text-sm font-bold rounded-xl shadow-[0_2px_12px_rgba(16,185,129,0.25)] hover:shadow-[0_4px_20px_rgba(16,185,129,0.35)] hover:-translate-y-px transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed disabled:transform-none flex items-center justify-center gap-2 mt-4"
                  >
                    {registerForm.formState.isSubmitting && (
                      <div className="animate-spin h-4 w-4 border-2 border-white/30 border-t-white rounded-full"></div>
                    )}
                    {registerForm.formState.isSubmitting ? "Registrando Empresa..." : "Registrar Empresa"}
                  </motion.button>
                </form>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

          {/* Footer */}
          <div className="mt-4 pt-3 border-t border-gray-100/60 dark:border-gray-800/40 text-center">
            {isRegisterMode && (
              <p className="text-gray-400 dark:text-gray-500 text-xs">
                ¿Ya tienes cuenta?{" "}
                <button
                  type="button"
                  onClick={() => setIsRegisterMode(false)}
                  className="font-bold text-reply-brand hover:underline focus:outline-none"
                >
                  Inicia Sesión
                </button>
              </p>
            )}

            <div className="mt-3 flex justify-center gap-6 text-[11px] font-medium text-gray-400 dark:text-gray-500">
              <Link to="/terms" className="text-gray-500 dark:text-gray-400 hover:text-reply-green dark:hover:text-reply-green-light transition-colors">Términos</Link>
              <span className="text-gray-300 dark:text-gray-700">·</span>
              <Link to="/privacy" className="text-gray-500 dark:text-gray-400 hover:text-reply-green dark:hover:text-reply-green-light transition-colors">Privacidad</Link>
              <span className="text-gray-300 dark:text-gray-700">·</span>
              <a href="mailto:soporte@sentrycrm.cloud" className="text-gray-500 dark:text-gray-400 hover:text-reply-green dark:hover:text-reply-green-light transition-colors">Soporte</a>
            </div>
          </div>
      </div>

      {/*  BLOCKED USER MODAL */}
      {blockedStatus && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-reply-surface dark:bg-reply-panel-dark rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden border border-red-100 dark:border-red-900/30 scale-100 animate-scale-in">
            <div className="p-8 flex flex-col items-center text-center">
              <div className="w-14 h-14 bg-red-50 dark:bg-red-900/20 rounded-full flex items-center justify-center mb-4 text-red-500">
                <svg
                  className="w-8 h-8"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                Acceso Restringido
              </h3>
              <p className="text-gray-500 dark:text-gray-400 text-sm mb-6">
                Tu cuenta presenta un bloqueo activo por el siguiente motivo:
              </p>
              <div className="bg-red-50 dark:bg-red-900/10 px-4 py-2 rounded-lg border border-red-100 dark:border-red-900/30 mb-6">
                <span className="text-red-600 dark:text-red-400 font-bold uppercase tracking-wide text-sm">
                  {blockedStatus === "OVERDUE"
                    ? "Pago Pendiente"
                    : blockedStatus}
                </span>
              </div>
              <button
                onClick={() => setBlockedStatus(null)}
                className="w-full py-3 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-xl font-bold hover:opacity-90 transition-opacity"
              >
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}

      {/* [APP] PWA INSTALL PROMPT */}
      <PWAInstallPrompt />
    </div>
  );
};
