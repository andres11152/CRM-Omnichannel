/**
 * [SEC] AXIOS SECURITY INTERCEPTORS
 *
 * Global interceptors that:
 * 1. Detect tenant context violations from backend
 * 2. Handle authentication errors
 * 3. Trigger emergency logout on security breaches
 *
 * Integrates with backend Prisma Extension security
 */

import axios, { AxiosError, InternalAxiosRequestConfig } from "axios";

import { useAuthStore } from "@/stores/authStore";

// Singleton flag to prevent multiple emergency logouts
let isEmergencyLogoutInProgress = false;

/**
 * Emergency logout function
 * Clears all state and forces reload
 */
export const performEmergencyLogout = (reason: string) => {
  // Prevent multiple simultaneous logouts
  if (isEmergencyLogoutInProgress) {
    return;
  }

  isEmergencyLogoutInProgress = true;

  console.error(`[Security] [ALERT] EMERGENCY LOGOUT: ${reason}`);

  // Clear ALL storage
  localStorage.clear();
  sessionStorage.clear();

  // Clear cookies
  document.cookie.split(";").forEach((c) => {
    document.cookie = c
      .replace(/^ +/, "")
      .replace(/=.*/, `=;expires=${new Date().toUTCString()};path=/`);
  });

  // Hard redirect
  window.location.href = "/login";
};

/**
 * Setup Axios Security Interceptors
 */
export const setupAxiosInterceptors = () => {
  // ========================================
  // REQUEST INTERCEPTOR
  // ========================================
  axios.interceptors.request.use(
    (config: InternalAxiosRequestConfig) => {
      // Attach auth token if available (Single Source of Truth)
      const token = useAuthStore.getState().token;
      if (token && config.headers) {
        config.headers.Authorization = `Bearer ${token}`;
      }

      // Add request ID for tracking
      if (config.headers) {
        config.headers["x-request-id"] =
          `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      }

      return config;
    },
    (error) => {
      return Promise.reject(error);
    },
  );

  // ========================================
  // RESPONSE INTERCEPTOR
  // ========================================
  axios.interceptors.response.use(
    (response) => {
      // Success response - no action needed
      return response;
    },
    (error: AxiosError) => {
      // Handle errors
      const { response } = error;

      if (!response) {
        // Network error
        console.error("[Axios] Network error:", error);
        return Promise.reject(error);
      }

      const status = response.status;
      const errorMessage =
        (response.data as unknown as { message?: string })?.message ||
        error.message;

      // ========================================
      // SECURITY VIOLATIONS
      // ========================================

      // [SEC] Backend Tenant Context Violation
      if (
        errorMessage &&
        (errorMessage.includes("tenant context") ||
          errorMessage.includes("TENANT_CONTEXT_MISSING") ||
          errorMessage.includes("Database operation attempted without"))
      ) {
        console.error(
          "[Security] [ALERT] Backend reported tenant context violation",
        );
        useAuthStore.getState().logout(); // Unified logout
        return Promise.reject(error);
      }

      // [SEC] Security Error (403)
      if (status === 403) {
        if (
          errorMessage &&
          (errorMessage.includes("company affiliation") ||
            errorMessage.includes("SECURITY"))
        ) {
          console.error("[Security] [ALERT] Backend security violation");
          useAuthStore.getState().logout(); // Unified logout
          return Promise.reject(error);
        }
      }

      // ========================================
      // AUTHENTICATION ERRORS
      // ========================================

      // 401 Unauthorized
      if (status === 401) {
        //  IGNORAR LOGIN: Si el error viene del endpoint de login, NO hacemos logout.
        // Un 401 en login significa "Credenciales Incorrectas", no "Token Expirado".
        // Dejamos que el componente LoginPage maneje el error y muestre el mensaje correcto.
        const requestUrl = error.config?.url || "";
        const isLoginRequest =
          requestUrl.includes("/auth/login") || requestUrl.includes("login");

        if (isLoginRequest) {
          console.warn(
            "[Auth] 401 on Login (Invalid Credentials) - Skipping global logout",
          );
          return Promise.reject(error);
        }

        console.warn("[Auth] Token expired or invalid - Triggering Logout");
        useAuthStore.getState().logout(); // Unified logout
        return Promise.reject(error);
      }

      // ========================================
      // OTHER ERRORS
      // ========================================

      // 500+ Server errors
      if (status >= 500) {
        console.error("[Server] Server error:", errorMessage);
      }

      return Promise.reject(error);
    },
  );

  console.log("[Security] [OK] Axios interceptors configured");
};

export default setupAxiosInterceptors;
