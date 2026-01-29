import React, { useState, useEffect } from "react";
import { useForm, UseFormRegister, FieldErrors, Path } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { toast } from "sonner";
import { AxiosError } from "axios";

import { useAuthStore } from "../stores/authStore";
import { api } from "../lib/axios";
import { ApiResponse } from "../types/common.types";
import { LoginResponse } from "../types/auth.types";
import { API_BASE_URL } from "../../services/apiConfig";
import { PWAInstallPrompt } from "../components/PWAInstallPrompt";

// 📝 VALIDATION SCHEMA
const loginSchema = z.object({
  email: z.string().min(1, "El email es requerido").email("Email inválido"),
  password: z.string().min(6, "La contraseña debe tener al menos 6 caracteres"),
});

type LoginFormData = z.infer<typeof loginSchema>;

// 🎨 REUSABLE COMPONENT: INPUT FIELD
interface FormInputProps {
  label: string;
  name: Path<LoginFormData>;
  type?: string;
  placeholder?: string;
  register: UseFormRegister<LoginFormData>;
  error?: FieldErrors<LoginFormData>[keyof LoginFormData];
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
    <div>
      <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 ml-1">
        {label}
      </label>
      <div className="relative group">
        <input
          type={effectiveType}
          {...register(name)}
          placeholder={placeholder}
          className={`
            block w-full px-4 py-3.5 rounded-xl border text-base transition-all duration-200
            bg-gray-50 dark:bg-[#1a252d] text-gray-900 dark:text-white
            placeholder-gray-400 dark:placeholder-gray-500
            ${
              error
                ? "border-red-500 bg-red-50/50 dark:bg-red-900/10 focus:ring-red-200"
                : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 focus:border-reply-green focus:ring-4 focus:ring-reply-green/10"
            }
            focus:outline-none
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
  const from = (location.state as any)?.from?.pathname || "/dashboard";

  // UI State
  const [darkMode, setDarkMode] = useState(false);
  const [blockedStatus, setBlockedStatus] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  // Dark Mode Sync
  useEffect(() => {
    if (darkMode) document.documentElement.classList.add("dark");
    else document.documentElement.classList.remove("dark");
  }, [darkMode]);

  const onSubmit = async (data: LoginFormData) => {
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

      // 🔄 DATA MAPPING: Convert ISO strings to Date objects to satisfy Store types
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
      toast.success(`Bienvenido de nuevo, ${user.name.split(" ")[0]} 👋`);
      navigate(from, { replace: true });
    } catch (error: unknown) {
      if (error instanceof AxiosError) {
        if (error.response?.status === 429) {
          toast.error("Demasiados intentos. Espera un minuto.");
        } else if (
          error.response?.status === 403 &&
          typeof error.response.data.message === "string" &&
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

  return (
    <div className="flex min-h-screen bg-white dark:bg-[#0b141a] font-sans selection:bg-green-100 dark:selection:bg-green-900">
      {/* 🖼️ LEFT SIDE: ARTWORK & BRANDING */}
      <div className="hidden lg:flex w-[48%] fixed inset-y-0 left-0 bg-gradient-to-br from-[#00a884] to-[#005c4b] items-center justify-center p-12 overflow-hidden z-0">
        {/* Background Patterns */}
        <div className="absolute inset-0 opacity-10 dark:opacity-20 bg-[radial-gradient(#ffffff33_1px,transparent_1px)] [background-size:24px_24px]"></div>
        <div className="absolute -top-32 -right-32 w-96 h-96 bg-white/10 rounded-full blur-[80px]"></div>
        <div className="absolute -bottom-32 -left-32 w-96 h-96 bg-black/10 rounded-full blur-[80px]"></div>

        <div className="z-10 text-center text-white max-w-lg">
          <div className="mb-10 flex justify-center relative">
            <div className="absolute inset-0 bg-white/20 blur-2xl rounded-full scale-150 animate-pulse-slow"></div>
            <svg
              viewBox="0 0 100 100"
              fill="none"
              className="w-32 h-32 relative drop-shadow-2xl"
            >
              <path
                d="M25 65C25 51.19 36.19 40 50 40H60C62.76 40 65 42.24 65 45V65C65 78.81 53.81 90 40 90H25V65Z"
                className="fill-white"
              />
              <path
                d="M40 50C40 36.19 51.19 25 65 25H75L90 10L85 50H75C72.24 50 70 52.24 70 55V60C70 68.28 63.28 75 55 75H40V50Z"
                className="fill-green-200"
              />
            </svg>
          </div>

          <h1 className="text-5xl font-bold mb-6 tracking-tight drop-shadow-sm">
            Reply Software
          </h1>
          <p className="text-xl text-green-50 font-medium leading-relaxed opacity-90">
            La plataforma definitiva de <br />
            <span className="text-white font-bold">
              Mensajería Inteligente & IA
            </span>{" "}
            <br />
            para escalar tu negocio.
          </p>

          {/* Trust Badges / Mini Footer for Left Side */}
          <div className="mt-16 flex items-center justify-center gap-6 opacity-60">
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                  clipRule="evenodd"
                />
              </svg>
              <span className="text-sm font-semibold">Enterprise Grade</span>
            </div>
            <div className="h-4 w-px bg-white/40"></div>
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z" />
              </svg>
              <span className="text-sm font-semibold">500+ Empresas</span>
            </div>
          </div>
        </div>
      </div>

      {/* 🔐 RIGHT SIDE: LOGIN FORM */}
      {/* Changed to flex-1 with lg:ml-[48%] to accommodate fixed left side. Added py-12 for vertical spacing. */}
      <div className="flex-1 lg:ml-[48%] flex flex-col justify-center items-center px-6 sm:px-12 xl:px-32 relative bg-white dark:bg-[#111b21] min-h-screen py-12">
        {/* Theme Toggle (Absolute Top Right) */}
        <button
          onClick={() => setDarkMode(!darkMode)}
          className="absolute top-6 right-6 p-2.5 rounded-full text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-all active:scale-95 z-20"
          aria-label="Toggle Theme"
        >
          {darkMode ? (
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
              />
            </svg>
          ) : (
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
              />
            </svg>
          )}
        </button>

        <div className="w-full max-w-[420px] mx-auto animate-fade-in-up z-10">
          {/* Header */}
          <div className="mb-10 text-center lg:text-left">
            <div className="inline-block lg:hidden mb-4">
              {/* Mobile Logo */}
              <svg viewBox="0 0 100 100" fill="none" className="w-12 h-12">
                <path
                  d="M25 65C25 51.19 36.19 40 50 40H60C62.76 40 65 42.24 65 45V65C65 78.81 53.81 90 40 90H25V65Z"
                  className="fill-reply-green"
                />
                <path
                  d="M40 50C40 36.19 51.19 25 65 25H75L90 10L85 50H75C72.24 50 70 52.24 70 55V60C70 68.28 63.28 75 55 75H40V50Z"
                  className="fill-green-200"
                />
              </svg>
            </div>
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-3">
              Bienvenido de nuevo
            </h2>
            <p className="text-base text-gray-500 dark:text-gray-400">
              Ingresa tus credenciales para acceder a tu panel de control.
            </p>
          </div>

          {/* Single Social Button */}
          <div className="mb-8">
            <a
              href={`${API_BASE_URL}/google/auth?action=login`}
              className="w-full flex items-center justify-center gap-3 py-3.5 px-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1f2937] hover:bg-gray-50 dark:hover:bg-[#2d3748] hover:border-gray-300 transition-all shadow-sm group"
            >
              <svg
                className="w-5 h-5 group-hover:scale-110 transition-transform"
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
              <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                Continuar con Google
              </span>
            </a>
          </div>

          {/* Divider */}
          <div className="relative mb-8">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200 dark:border-gray-700"></div>
            </div>
            <div className="relative flex justify-center">
              <span className="px-4 bg-white dark:bg-[#111b21] text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-widest">
                O con tu email
              </span>
            </div>
          </div>

          {/* Main Form */}
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <FormInput
              label="Correo Electrónico"
              name="email"
              type="email"
              placeholder="ej. nombre@empresa.com"
              register={register}
              error={errors.email}
            />

            <div>
              <FormInput
                label="Contraseña"
                name="password"
                type="password"
                placeholder="••••••••"
                register={register}
                error={errors.password}
                togglePassword={true}
              />
              <div className="flex justify-end mt-2">
                <Link
                  to="/forgot-password"
                  className="text-sm font-semibold text-reply-green hover:text-green-700 dark:hover:text-green-400 transition-colors"
                >
                  ¿Olvidaste tu contraseña?
                </Link>
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-4 bg-reply-green hover:bg-green-600 dark:bg-reply-green-dark dark:hover:bg-green-700 text-white font-bold rounded-xl shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all duration-200 disabled:opacity-70 disabled:cursor-not-allowed disabled:transform-none flex items-center justify-center gap-2"
            >
              {isSubmitting && (
                <svg
                  className="animate-spin h-5 w-5 text-white"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth={4}
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
              )}
              {isSubmitting ? "Iniciando Sesión..." : "Ingresar al Panel"}
            </button>
          </form>

          {/* Footer */}
          <div className="mt-10 pt-6 border-t border-gray-100 dark:border-gray-800 text-center">
            <p className="text-gray-500 dark:text-gray-400 text-sm">
              ¿Aún no tienes cuenta?{" "}
              <a
                href="#"
                className="font-bold text-reply-green hover:underline"
              >
                Solicita una demo
              </a>
            </p>

            <div className="mt-8 flex justify-center gap-8 text-xs font-medium text-gray-400 dark:text-gray-500">
              <a
                href="#"
                className="hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              >
                Términos y Condiciones
              </a>
              <a
                href="#"
                className="hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              >
                Política de Privacidad
              </a>
              <a
                href="#"
                className="hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              >
                Soporte
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* 🛑 BLOCKED USER MODAL */}
      {blockedStatus && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white dark:bg-[#1f2937] rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden border border-red-100 dark:border-red-900/30 scale-100 animate-scale-in">
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

      {/* 📱 PWA INSTALL PROMPT */}
      <PWAInstallPrompt />
    </div>
  );
};
