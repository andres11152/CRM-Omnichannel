import { AxiosError, AxiosRequestConfig } from "axios";
import { toast } from "sonner";
import i18n from "@/i18n";
import { api as httpClient } from "@/lib/axios";

/**
 * Legacy "unwrap response.data + auto-toast on error" API surface used by a
 * handful of older services (chatService, companyService, teamService,
 * useTeamMembers, ExportButton). Kept for backward compatibility with their
 * call sites (`const data = await api.get(...)`, no `.data` unwrapping),
 * but the actual HTTP transport now delegates to the single canonical axios
 * instance in `@/lib/axios` — same base URL resolution, same Zustand-store
 * token injection, same silent 401-refresh-and-retry queue — instead of
 * maintaining a second, weaker axios instance (previously: its own
 * `localStorage`-only token read with no refresh-retry, meaning a session
 * that a refresh would have saved elsewhere in the app just logged out here).
 */
export interface ApiRequestConfig extends AxiosRequestConfig {
  skipErrorToast?: boolean;
}

function handleError(error: unknown, skipErrorToast: boolean): never {
  const axiosError = error as AxiosError<{ message?: string; [key: string]: unknown }>;

  if (axiosError.response) {
    const status = axiosError.response.status;
    const data = axiosError.response.data as { message?: string } | undefined;

    switch (status) {
      case 401:
        // Already retried-and-failed by the shared instance's refresh queue
        // (which also handles the logout + redirect) — nothing more to do here.
        break;
      case 403:
        if (!skipErrorToast) {
          toast.error(data?.message || i18n.t("api_client.toast.forbidden", "No tienes permisos para realizar esta acción."));
        }
        break;
      case 404:
        // Not found — let the caller decide how to handle it, no toast.
        break;
      case 500:
        if (!skipErrorToast) {
          toast.error(i18n.t("api_client.toast.server_error", "Error del servidor. Por favor, intenta de nuevo más tarde."));
        }
        break;
      default:
        if (data?.message && !skipErrorToast) {
          toast.error(data.message);
        }
    }

    throw { status, message: data?.message || "Request failed", data };
  }

  if (axiosError.request) {
    if (!skipErrorToast) {
      toast.error(i18n.t("api_client.toast.network_error", "Error de conexión. Verifica tu internet."));
    }
    throw { status: 0, message: "Network error", data: null };
  }

  throw { status: 0, message: error instanceof Error ? error.message : String(error), data: null };
}

// `T` defaults to `any` (not `unknown`) to match axios's own default and the
// pre-existing behavior every one of this shim's 5 legacy callers already
// relies on (e.g. `const res = await apiClient.get(...); res.data || res`
// with no explicit type argument) — this is a deliberately loose, isolated
// legacy shim, not a reintroduction of `any` into the rest of the codebase.
async function unwrap<T>(promise: Promise<{ data: unknown }>, skipErrorToast: boolean): Promise<T> {
  try {
    const response = await promise;
    return response.data as T;
  } catch (error) {
    return handleError(error, skipErrorToast);
  }
}

export const api = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- legacy shim, see `unwrap` comment above
  get: <T = any>(url: string, config?: ApiRequestConfig): Promise<T> =>
    unwrap<T>(httpClient.get(url, config), Boolean(config?.skipErrorToast)),

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- legacy shim, see `unwrap` comment above
  post: <T = any>(url: string, data?: unknown, config?: ApiRequestConfig): Promise<T> =>
    unwrap<T>(httpClient.post(url, data, config), Boolean(config?.skipErrorToast)),

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- legacy shim, see `unwrap` comment above
  put: <T = any>(url: string, data?: unknown, config?: ApiRequestConfig): Promise<T> =>
    unwrap<T>(httpClient.put(url, data, config), Boolean(config?.skipErrorToast)),

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- legacy shim, see `unwrap` comment above
  patch: <T = any>(url: string, data?: unknown, config?: ApiRequestConfig): Promise<T> =>
    unwrap<T>(httpClient.patch(url, data, config), Boolean(config?.skipErrorToast)),

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- legacy shim, see `unwrap` comment above
  delete: <T = any>(url: string, config?: ApiRequestConfig): Promise<T> =>
    unwrap<T>(httpClient.delete(url, config), Boolean(config?.skipErrorToast)),
};

export default api;
