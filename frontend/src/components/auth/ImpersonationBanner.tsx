import React, { useEffect, useState } from "react";
import { useAuthStore } from "@/stores/authStore";
import { Eye, LogOut, ShieldAlert } from "lucide-react";
import { jwtDecode } from "jwt-decode";

export const ImpersonationBanner = () => {
  const [isImpersonating, setIsImpersonating] = useState(false);
  const login = useAuthStore((state) => state.login);
  const currentUser = useAuthStore((state) => state.user);

  useEffect(() => {
    // Check every second to be reactive to localStorage changes (simple polling)
    // or just rely on mount if we assume full reload
    const check = () => {
      const masterToken = localStorage.getItem("reply_master_token");
      setIsImpersonating(!!masterToken);
    };

    check();
    const interval = setInterval(check, 1000); // Poll for changes
    return () => clearInterval(interval);
  }, []);

  const handleExit = () => {
    const masterToken = localStorage.getItem("reply_master_token");
    if (masterToken) {
      try {
        // Decode master token to restore user object basic info
        const decoded = jwtDecode<{ id: string; email: string }>(masterToken);

        // Construct master user object
        const masterUser = {
          id: decoded.id,
          email: decoded.email,
          role: "MASTER",
          companyId: null,
          name: "Master Admin",
          avatar: "",
          preferences: {},
        };

        // Restore session
        login(
          masterUser as unknown as Parameters<typeof login>[0],
          masterToken,
        );

        // Clear backup
        localStorage.removeItem("reply_master_token");

        // Force full reload to /admin to ensure clean state
        window.location.href = "/admin";
      } catch (e) {
        console.error("Failed to restore master session", e);
        useAuthStore.getState().logout();
        window.location.href = "/login";
      }
    }
  };

  if (!isImpersonating) return null;

  return (
    <div className="w-full h-10 bg-red-600 text-white flex items-center justify-between px-4 shadow-md flex-none relative z-50">
      <div className="flex items-center gap-2 text-sm font-medium">
        <ShieldAlert className="w-4 h-4 animate-pulse" />
        <span>MODO DE IMPERSONACIÓN ACTIVO</span>
        <span className="opacity-75 text-xs hidden md:inline">
          - Ests viendo el sistema como{" "}
          <strong>{currentUser?.email || "el usuario"}</strong>
        </span>
      </div>
      <button
        onClick={handleExit}
        className="flex items-center gap-2 bg-white/10 hover:bg-white/20 px-3 py-1 rounded text-xs font-bold transition-all border border-white/20"
      >
        <LogOut className="w-3 h-3" />
        SALIR A MASTER
      </button>
    </div>
  );
};
