import { API_BASE_URL } from "./apiConfig";

type ApiOptions = RequestInit & {
  useFormData?: boolean;
};

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  private getAuthToken(): string | null {
    return localStorage.getItem("token");
  }

  async request<T>(endpoint: string, options: ApiOptions = {}): Promise<T> {
    const token = this.getAuthToken();
    const headers: Record<string, string> = { ...options.headers };

    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    if (!options.useFormData) {
      headers["Content-Type"] = "application/json";
    }

    const response = await fetch(`${this.baseUrl}${endpoint}`, { ...options, headers });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: `HTTP Error: ${response.status}` }));
      throw new Error(error.message || "An unknown API error occurred.");
    }

    return response.status === 204 ? (null as T) : response.json();
  }
}

export const apiClient = new ApiClient(API_BASE_URL);