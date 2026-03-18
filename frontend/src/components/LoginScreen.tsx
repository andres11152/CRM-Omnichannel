import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";

import { jwtDecode } from "jwt-decode";
import { User, UserRole } from "@/types";
import { API_BASE_URL } from "@/services/apiConfig";

interface Props {
  onLogin: (user: User) => void;
  darkMode: boolean;
  setDarkMode: (mode: boolean) => void;
}

export const LoginScreen: React.FC<Props> = ({
  onLogin,
  darkMode,
  setDarkMode,
}) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [blockedStatus, setBlockedStatus] = useState<string | null>(null);

  // Check for Token from Google Login Redirect
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");
    const errorParam = params.get("error");

    if (token) {
      handleTokenLogin(token);
      // Clean URL
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (errorParam) {
      if (errorParam === "no_email")
        setError("No pudimos obtener tu email de Google.");
      else if (errorParam === "auth_failed")
        setError("Falló la autenticación con Google.");
      else setError("Error de inicio de sesión.");
    }
  }, []);

  const handleTokenLogin = (token: string) => {
    try {
      localStorage.setItem("token", token);
      const decoded = jwtDecode<{
        id: string;
        email: string;
        role: string;
        companyId: string;
        name?: string;
        companyStatus?: string;
        isActive?: boolean;
        phone?: string;
      }>(token);
      const user: User = {
        id: decoded.id || "unknown",
        name: decoded.name || "Usuario",
        email: decoded.email || "",
        role: (decoded.role || "company_admin") as User["role"],
        companyId: decoded.companyId,
        companyStatus: decoded.companyStatus,
        isActive: decoded.isActive ?? true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        phone: decoded.phone || undefined,
      };
      onLogin(user);
    } catch (e) {
      console.error("Invalid token from URL", e);
      setError("Token invlido recibido.");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);
    setBlockedStatus(null);

    // Rate limiting simulated delay for UX
    // await new Promise(r => setTimeout(r, 800));

    try {
      const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (response.ok && data.status === "success") {
        if (data.token) {
          handleTokenLogin(data.token);
        }
      } else {
        // Handle Rate Limit (429) explicitly if backend sends it
        if (response.status === 429) {
          setError("Demasiados intentos. Por favor espera un minuto.");
        } else if (
          response.status === 403 &&
          data.message.includes("Acceso denegado")
        ) {
          const match = data.message.match(/estado (\w+)/);
          const status = match ? match[1] : "SUSPENDED";
          setBlockedStatus(status);
        } else {
          setError(data.message || "Credenciales incorrectas.");
        }
      }
    } catch (err) {
      console.error("Login error:", err);
      setError("Error de conexión. Contacta soporte.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-reply-bg dark:bg-reply-bg-dark font-sans transition-colors duration-300">
      {/* LEFT SIDE: BRANDING */}
      <div className="hidden lg:flex w-1/2 relative overflow-hidden bg-reply-brand dark:bg-reply-brand-dark items-center justify-center">
        {/* Abstract geometric pattern */}
        <div className="absolute inset-0 opacity-10 dark:opacity-20 bg-[radial-gradient(#ffffff33_1px,transparent_1px)] [background-size:16px_16px]"></div>
        <div className="absolute top-0 right-0 w-96 h-96 bg-white/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-black/10 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2"></div>

        <div className="z-10 text-center text-white px-12">
          <div className="mb-8 flex justify-center">
            {/* Large Logo */}
            <svg
              viewBox="0 0 100 100"
              fill="none"
              className="w-32 h-32 drop-shadow-2xl animate-fade-in-up"
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
          <h1 className="text-5xl font-bold mb-6 tracking-tight">
            Reply Software
          </h1>
          <p className="text-xl text-green-100 max-w-md mx-auto leading-relaxed">
            La plataforma definitiva de Mensajería Inteligente & IA para escalar
            tu negocio.
          </p>
        </div>
      </div>

      {/* RIGHT SIDE: FORM */}
      <div className="w-full lg:w-1/2 flex flex-col justify-center px-6 sm:px-12 xl:px-24 relative">
        {/* Theme Toggle Absolute */}
        <button
          onClick={() => setDarkMode(!darkMode)}
          className="absolute top-6 right-6 p-2 rounded-full text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        >
          {darkMode ? (
            <svg
              className="w-6 h-6"
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
          ) : (
            <svg
              className="w-6 h-6"
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
          )}
        </button>

        <div className="max-w-md w-full mx-auto">
          <div className="mb-10 text-center lg:text-left">
            <h2 className="text-3xl font-extrabold text-gray-900 dark:text-white mb-2">
              Bienvenido de nuevo
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Ingresa tus credenciales para acceder al panel.
            </p>
          </div>

          {/* GOOGLE BUTTON */}
          <div className="mb-8">
            <a
              href={`${API_BASE_URL}/google/auth?action=login`}
              className="w-full flex items-center justify-center gap-3 py-3 px-4 border border-gray-300 dark:border-gray-600 rounded-xl shadow-sm bg-white dark:bg-reply-panel-dark text-sm font-semibold text-gray-700 dark:text-white hover:bg-reply-bg dark:hover:bg-[#2a3942] transition-colors focus:ring-2 focus:ring-offset-2 focus:ring-gray-200"
            >
              <svg
                className="w-5 h-5"
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
              Continuar con Google
            </a>
          </div>

          <div className="relative mb-8">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-300 dark:border-reply-border-dark"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-reply-bg dark:bg-reply-bg-dark text-gray-500 font-medium">
                O continúa con email
              </span>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 ml-1">
                Correo Electrónico
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="block w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-reply-panel-dark text-gray-900 dark:text-white shadow-sm focus:ring-2 focus:ring-reply-green focus:border-transparent transition-all placeholder-gray-400 dark:placeholder-gray-500"
                placeholder="nombre@empresa.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 ml-1">
                Contraseña
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="block w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-reply-panel-dark text-gray-900 dark:text-white shadow-sm focus:ring-2 focus:ring-reply-green focus:border-transparent transition-all placeholder-gray-400 dark:placeholder-gray-500 pr-12"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                >
                  {showPassword ? (
                    <svg
                      className="w-5 h-5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
                      />
                    </svg>
                  ) : (
                    <svg
                      className="w-5 h-5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                      />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                      />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            <div className="flex justify-end mt-2">
              <Link
                to="/forgot-password"
                className="text-sm font-medium text-reply-green hover:underline dark:text-reply-green-dark"
              >
                ¿¿Olvidaste tu contraseña?
              </Link>
            </div>

            {error && (
              <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-300 p-4 rounded-xl text-sm text-center font-medium animate-shake">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3.5 px-4 bg-reply-green hover:bg-green-600 dark:bg-reply-green-dark dark:hover:bg-green-700 text-white font-bold rounded-xl shadow-lg hover:shadow-xl transition-all transform active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isLoading && (
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
              {isLoading ? "Iniciando Sesión..." : "Ingresar"}
            </button>
          </form>

          <div className="mt-8 text-center text-sm">
            <p className="text-gray-500 dark:text-gray-400">
              ¿No tienes cuenta?{" "}
              <a
                href="#"
                className="font-semibold text-reply-green dark:text-reply-green-dark hover:underline"
              >
                Solicita una demo
              </a>
            </p>
            <div className="mt-6 flex justify-center gap-6 text-xs text-gray-400">
              <a href="#" className="hover:text-gray-500">
                Términos
              </a>
              <a href="#" className="hover:text-gray-500">
                Privacidad
              </a>
              <a href="#" className="hover:text-gray-500">
                Ayuda
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Blocked Account Modal */}
      {blockedStatus && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
          <div className="bg-white dark:bg-reply-panel-dark rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-red-200 dark:border-red-900/50 scale-100">
            <div className="bg-red-50 dark:bg-red-900/20 p-6 flex flex-col items-center text-center border-b border-red-100 dark:border-red-900/30">
              <div className="w-16 h-16 bg-red-100 dark:bg-red-900/50 rounded-full flex items-center justify-center mb-4">
                <svg
                  className="w-8 h-8 text-red-600 dark:text-red-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                Acceso Restringido
              </h3>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-reply-bg dark:bg-reply-surface-dark p-4 rounded-lg">
                <p className="text-xs text-gray-500 dark:text-gray-400 uppercase font-bold mb-1">
                  Motivo
                </p>
                <p className="text-lg font-bold text-red-600 dark:text-red-400">
                  {blockedStatus === "OVERDUE"
                    ? "Pago Pendiente"
                    : blockedStatus}
                </p>
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
    </div>
  );
};
