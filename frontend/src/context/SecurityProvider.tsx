/**
 * TENANT SECURITY PROVIDER
 *
 * Prevents cross-tenant data contamination in frontend state by:
 * 1. Detecting companyId changes
 * 2. Force-clearing ALL React state on company switch
 * 3. Emergency logout on security violations
 *
 * Security Model:
 * - Company changes: Full state reset (prevent stale data)
 * - Missing auth: Immediate redirect
 * - Backend tenant errors: Emergency clear + redirect
 */

import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { useNavigate } from "react-router-dom";
import { ShieldAlert } from "lucide-react";

interface SecurityContextValue {
  currentCompanyId: string | null;
  emergencyLogout: (reason: string) => void;
  isSecure: boolean;
}

const SecurityContext = createContext<SecurityContextValue | null>(null);

export const useSecurity = () => {
  const context = useContext(SecurityContext);
  if (!context) {
    throw new Error("useSecurity must be used within SecurityProvider");
  }
  return context;
};

interface SecurityProviderProps {
  children: React.ReactNode;
}

export const SecurityProvider: React.FC<SecurityProviderProps> = ({
  children,
}) => {
  const navigate = useNavigate();
  const [currentCompanyId, setCurrentCompanyId] = useState<string | null>(null);
  const [isSecure, setIsSecure] = useState(true);

  // Track previous companyId to detect changes
  const previousCompanyIdRef = useRef<string | null>(null);

  /**
   * EMERGENCY LOGOUT
   * Clears ALL possible state and forces browser reload
   */
  const emergencyLogout = (reason: string) => {
    console.error(`[Security] EMERGENCY LOGOUT: ${reason}`);

    // 1. Clear ALL storage
    localStorage.clear();
    sessionStorage.clear();

    // 2. Clear cookies (best effort - HttpOnly cookies can't be cleared from JS)
    document.cookie.split(";").forEach((c) => {
      document.cookie = c
        .replace(/^ +/, "")
        .replace(/=.*/, `=;expires=${new Date().toUTCString()};path=/`);
    });

    // 3. Mark as insecure
    setIsSecure(false);

    // 4. Hard redirect (forces full page reload, clearing ALL React state)
    window.location.href = "/login";
  };

  /**
   * Monitor for companyId changes
   */
  useEffect(() => {
    const checkCompanyId = () => {
      try {
        // Get current auth token
        const token = localStorage.getItem("token");

        if (!token) {
          setCurrentCompanyId(null);
          return;
        }

        // Decode JWT to extract companyId (without verification - just for UI)
        const payload = JSON.parse(atob(token.split(".")[1]));
        const newCompanyId = payload.companyId;

        if (
          previousCompanyIdRef.current &&
          previousCompanyIdRef.current !== newCompanyId
        ) {
          console.warn(
            `[Security] COMPANY SWITCH DETECTED: ${previousCompanyIdRef.current} → ${newCompanyId}`,
          );

          // Emergency logout to prevent data contamination
          emergencyLogout("Company ID changed - forcing full state reset");
          return;
        }

        previousCompanyIdRef.current = newCompanyId;
        setCurrentCompanyId(newCompanyId);
      } catch (error) {
        console.error("[Security] Failed to decode token:", error);
        setCurrentCompanyId(null);
      }
    };

    // Initial check
    checkCompanyId();

    // Monitor storage changes (e.g., login in another tab)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === "token") {
        checkCompanyId();
      }
    };

    window.addEventListener("storage", handleStorageChange);

    // Periodic check (every 30 seconds) as extra safety
    const interval = setInterval(checkCompanyId, 30000);

    return () => {
      window.removeEventListener("storage", handleStorageChange);
      clearInterval(interval);
    };
  }, []);

  /**
   * Block rendering if security is compromised
   */
  if (!isSecure) {
    return (
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "100vh",
          fontFamily: "sans-serif",
          flexDirection: "column",
          gap: "1rem",
        }}
      >
        <ShieldAlert size={48} className="text-red-500 mb-4" />
        <h1 className="text-2xl font-bold">Security Check</h1>
        <p className="text-slate-400">Redirecting to login...</p>
      </div>
    );
  }

  const value: SecurityContextValue = {
    currentCompanyId,
    emergencyLogout,
    isSecure,
  };

  return (
    <SecurityContext.Provider value={value}>
      {children}
    </SecurityContext.Provider>
  );
};

export default SecurityProvider;
