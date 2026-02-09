import axios, { AxiosInstance, AxiosRequestConfig, AxiosError } from "axios";
import { toast } from "sonner";

// ==================== CONFIG ====================

// Use relative path in development (Vite proxy handles the rest)
// In production, use full URL from env variable
const API_BASE_URL = import.meta.env.DEV
  ? "/api"
  : (import.meta.env.VITE_API_URL || "http://localhost:4000")
      .replace(/\/api\/?$/, "")
      .replace(/\/$/, "") + "/api";

// ==================== AXIOS INSTANCE ====================

const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
  headers: {
    "Content-Type": "application/json",
  },
});

// ==================== REQUEST INTERCEPTOR ====================

/**
 * Inject authentication token automatically
 */
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("token");

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    return config;
  },
  (error) => {
    return Promise.reject(error);
  },
);

// ==================== RESPONSE INTERCEPTOR ====================

/**
 * Handle global error responses
 */
apiClient.interceptors.response.use(
  (response) => {
    // Success: Return data directly
    return response.data;
  },
  (error: AxiosError) => {
    // Error handling
    if (error.response) {
      const status = error.response.status;
      const data: any = error.response.data;

      // Handle specific status codes
      switch (status) {
        case 401:
          // Unauthorized: Clear token and redirect to login
          localStorage.removeItem("token");
          localStorage.removeItem("auth-storage");

          // Only show toast if not already on login page
          if (!window.location.pathname.includes("/login")) {
            toast.error(
              "Sesión expirada. Por favor, inicia sesión nuevamente.",
            );
            setTimeout(() => {
              window.location.href = "/login";
            }, 1500);
          }
          break;

        case 403:
          // Forbidden
          toast.error(
            data.message || "No tienes permisos para realizar esta acción.",
          );
          break;

        case 404:
          // Not found - Don't show toast, let component handle it
          break;

        case 500:
          toast.error(
            "Error del servidor. Por favor, intenta de nuevo más tarde.",
          );
          break;

        default:
          // Generic error
          if (data.message) {
            toast.error(data.message);
          }
      }

      // Reject with structured error
      return Promise.reject({
        status,
        message: data.message || "Request failed",
        data: data,
      });
    } else if (error.request) {
      // Network error
      toast.error("Error de conexión. Verifica tu internet.");
      return Promise.reject({
        status: 0,
        message: "Network error",
        data: null,
      });
    } else {
      // Other errors
      return Promise.reject({
        status: 0,
        message: error.message,
        data: null,
      });
    }
  },
);

// ==================== TYPED API CLIENT ====================

/**
 * Type-safe API client with common HTTP methods
 */
export const api = {
  /**
   * GET request
   */
  get: <T = any>(url: string, config?: AxiosRequestConfig): Promise<T> => {
    return apiClient.get(url, config);
  },

  /**
   * POST request
   */
  post: <T = any>(
    url: string,
    data?: any,
    config?: AxiosRequestConfig,
  ): Promise<T> => {
    return apiClient.post(url, data, config);
  },

  /**
   * PUT request
   */
  put: <T = any>(
    url: string,
    data?: any,
    config?: AxiosRequestConfig,
  ): Promise<T> => {
    return apiClient.put(url, data, config);
  },

  /**
   * PATCH request
   */
  patch: <T = any>(
    url: string,
    data?: any,
    config?: AxiosRequestConfig,
  ): Promise<T> => {
    return apiClient.patch(url, data, config);
  },

  /**
   * DELETE request
   */
  delete: <T = any>(url: string, config?: AxiosRequestConfig): Promise<T> => {
    return apiClient.delete(url, config);
  },
};

// Export the instance for advanced usage
export default apiClient;
