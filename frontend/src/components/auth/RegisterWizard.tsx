import React, { useState, useEffect } from "react";
import { useForm, UseFormRegister, FieldError } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";

import { useAuthStore } from "@/stores/authStore";
import { api } from "@/lib/axios";
import { ApiResponse } from "@/types/common.types";
import { LoginResponse } from "@/types/auth.types";
import { API_BASE_URL } from "@/services/apiConfig";

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

type RegisterFormData = z.infer<typeof registerSchema>;

interface FormInputProps {
  label: string;
  name: string;
  type?: string;
  placeholder?: string;
  register: UseFormRegister<any>;
  error?: FieldError;
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
  const { t } = useTranslation();

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
            bg-reply-bg dark:bg-gray-800/50 hover:bg-gray-100/50 dark:hover:bg-gray-800/80
            text-gray-900 dark:text-white placeholder-gray-400/80
            focus:ring-2 focus:ring-inset focus:ring-reply-brand/50 focus:bg-white dark:focus:bg-gray-950/30
            ring-1 ring-inset ring-gray-200/50 dark:ring-gray-700/30
          `}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setShow(!show)}
            className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-gray-400 hover:text-gray-600 transition-colors"
          >
            {show ? (
              <span className="text-[10px] font-black tracking-wider uppercase text-reply-brand/80">{t("common.hide", "Ocultar")}</span>
            ) : (
              <span className="text-[10px] font-black tracking-wider uppercase text-gray-400">{t("common.show", "Mostrar")}</span>
            )}
          </button>
        )}
      </div>
      {error && (
        <span className="text-[11px] font-semibold text-rose-500 ml-1 mt-1 block">
          {error.message}
        </span>
      )}
    </div>
  );
};

export interface RegisterWizardProps {
  onCancel: () => void;
}

export const RegisterWizard: React.FC<RegisterWizardProps> = ({ onCancel }) => {
  const navigate = useNavigate();
  const loginStore = useAuthStore();
  const { t } = useTranslation();

  const registerForm = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
  });

  const watchedCompanyName = registerForm.watch("companyName");
  useEffect(() => {
    if (watchedCompanyName) {
      const suggestedSlug = watchedCompanyName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");
      registerForm.setValue("slug", suggestedSlug);
    }
  }, [watchedCompanyName, registerForm.setValue]);

  const handleGoogleRegister = (e: React.MouseEvent) => {
    e.preventDefault();
    const companyName = registerForm.getValues("companyName");
    const slug = registerForm.getValues("slug") || "";

    if (!companyName || companyName.trim().length < 2) {
      registerForm.setError("companyName", {
        type: "manual",
        message: t("auth.register.validation.company_required", "Por favor, ingresa el nombre de tu empresa primero."),
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
          t("auth.register.error.invalid_response", "Respuesta inválida del servidor (Falta token o usuario)"),
        );
      }

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

      // @ts-ignore
      loginStore.login(mappedUser, token);
      toast.success(`${t("auth.register.welcome", "Bienvenido")}, ${user.name.split(" ")[0]}`);
      navigate("/dashboard", { replace: true });
    } catch (error: unknown) {
      console.error("[LoginPage] Register Error:", error);
      let msg = t("auth.register.error.failed", "Error al registrar la empresa");
      if (error && typeof error === "object" && "response" in error) {
        const response = (error as { response?: { data?: { message?: string } } }).response;
        if (response?.data?.message) {
          msg = response.data.message;
        }
      } else if (error instanceof Error) {
        msg = error.message;
      }
      toast.error(msg);
    }
  };

  return (
    <motion.div
      key="register"
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -12 }}
      transition={{ duration: 0.2, ease: "easeInOut" }}
      className="space-y-4"
    >
      <FormInput
        label={t("auth.register.company_name_label", "Nombre de tu Empresa")}
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
            {t("auth.register.google_signup", "Registrarme con Google")}
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
            {t("auth.register.credentials_divider", "o crear credenciales directas")}
          </span>
        </div>
      </div>

      <form onSubmit={registerForm.handleSubmit(onSubmitRegister)} className="space-y-4">
        <FormInput
          label={t("auth.register.admin_email_label", "Correo del Administrador")}
          name="adminEmail"
          type="email"
          placeholder="ej. nombre@empresa.com"
          register={registerForm.register}
          error={registerForm.formState.errors.adminEmail}
        />

        <FormInput
          label={t("auth.register.admin_password_label", "Contraseña de Administrador")}
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
          {registerForm.formState.isSubmitting ? t("auth.register.submitting", "Registrando Empresa...") : t("auth.register.submit", "Registrar Empresa")}
        </motion.button>
      </form>
    </motion.div>
  );
};
