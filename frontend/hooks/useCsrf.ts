import { useState, useEffect } from "react";
import { api } from "../src/lib/axios";

/**
 * 🛡️ CSRF Token Hook
 * Automatically fetches and manages CSRF tokens for the authenticated user
 */
export const useCsrfToken = () => {
  const [csrfToken, setCsrfToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchCsrfToken = async () => {
    const token = localStorage.getItem("token");
    if (!token) {
      setError("Not authenticated");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const res = await api.get("/csrf-token");

      const token = res.data.csrfToken;
      setCsrfToken(token);

      // Store in sessionStorage for automatic inclusion in requests
      sessionStorage.setItem("csrf-token", token);

      // Update Axios defaults to include CSRF token in future requests
      api.defaults.headers.common["X-CSRF-Token"] = token;
    } catch (err: any) {
      setError(err.message);
      console.error("[CSRF] Failed to fetch token:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    // Fetch CSRF token on mount if authenticated
    const token = localStorage.getItem("token");
    if (token && !csrfToken) {
      fetchCsrfToken();
    }
  }, []);

  return {
    csrfToken,
    isLoading,
    error,
    refreshToken: fetchCsrfToken,
  };
};

// Removed global fetch monkey-patching. Axios handles headers via interceptors/defaults.
