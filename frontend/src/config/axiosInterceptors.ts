/**
 * 🛡️ AXIOS SECURITY INTERCEPTORS
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

  console.error(`[Security] 🚨 EMERGENCY LOGOUT: ${reason}`);

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
      const errorMessage = (response.data as any)?.message || error.message;

      // ========================================
      // SECURITY VIOLATIONS
      // ========================================

      // 🛡️ Backend Tenant Context Violation
      if (
        errorMessage &&
        (errorMessage.includes("tenant context") ||
          errorMessage.includes("TENANT_CONTEXT_MISSING") ||
          errorMessage.includes("Database operation attempted without"))
      ) {
        console.error(
          "[Security] 🚨 Backend reported tenant context violation",
        );
        useAuthStore.getState().logout(); // Unified logout
        return Promise.reject(error);
      }

      // 🛡️ Security Error (403)
      if (status === 403) {
        if (
          errorMessage &&
          (errorMessage.includes("company affiliation") ||
            errorMessage.includes("SECURITY"))
        ) {
          console.error("[Security] 🚨 Backend security violation");
          useAuthStore.getState().logout(); // Unified logout
          return Promise.reject(error);
        }
      }

      // ========================================
      // AUTHENTICATION ERRORS
      // ========================================

      // 401 Unauthorized
      if (status === 401) {
        console.warn("[Auth] Token expired or invalid");
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

  console.log("[Security] ✅ Axios interceptors configured");
};

export default setupAxiosInterceptors;
