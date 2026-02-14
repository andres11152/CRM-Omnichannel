import React, { useState, useEffect, useMemo } from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { DropResult } from "@hello-pangea/dnd";
import { Toaster, toast } from "sonner";
import { useAuthStore } from "@/stores/authStore";
import { NAV_ITEMS } from "@/config/navigation";
import { useSocketInit } from "@/hooks/useSocketInit";
import { updateUserPreferences } from "@/services/userService";
import { Menu } from "lucide-react";
import { SidebarEnhanced } from "./SidebarEnhanced";
import { CommandCenter } from "@/components/layout/CommandCenter";
import { NotificationBell } from "@/components/ui/NotificationBell";

// --- MAIN LAYOUT PRO ---

// --- MAIN LAYOUT PRO ---

export const MainLayout = () => {
  const { user, logout, updateUser } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(
    user?.preferences?.darkMode || false,
  );
  const [sidebarOrder, setSidebarOrder] = useState<string[]>([]);

  // Real-time notifications
  useSocketInit();

  // Initialize sidebar order
  useEffect(() => {
    if (user?.preferences?.sidebarOrder) {
      const allIds = NAV_ITEMS.map((i) => i.id);
      const saved = user.preferences.sidebarOrder;
      const combined = [
        ...saved,
        ...allIds.filter((id) => !saved.includes(id)),
      ];
      setSidebarOrder(combined);
    } else {
      setSidebarOrder(NAV_ITEMS.map((i) => i.id));
    }
  }, [user]);

  // Dark Mode Sync
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [darkMode]);

  const toggleDarkMode = async () => {
    const newMode = !darkMode;
    setDarkMode(newMode);
    if (user) {
      updateUser({ preferences: { ...user.preferences, darkMode: newMode } });
      updateUserPreferences(user.id, { darkMode: newMode }).catch(
        console.error,
      );
    }
  };

  const handleDragEnd = async (result: DropResult) => {
    if (!result.destination) return;
    const newOrder = Array.from(sidebarOrder);
    const [moved] = newOrder.splice(result.source.index, 1);
    newOrder.splice(result.destination.index, 0, moved);
    setSidebarOrder(newOrder);
    if (user) {
      updateUser({
        preferences: { ...user.preferences, sidebarOrder: newOrder },
      });
      updateUserPreferences(user.id, { sidebarOrder: newOrder }).catch(
        console.error,
      );
    }
  };

  const visibleNavItems = useMemo(() => {
    if (!user) return [];
    const itemMap = new Map(NAV_ITEMS.map((item) => [item.id, item]));
    return sidebarOrder
      .map((id) => itemMap.get(id))
      .filter((item): item is (typeof NAV_ITEMS)[0] => {
        if (!item) return false;
        const userRole = user.role?.toLowerCase() as any; // Normalize to lowercase
        if (item.masterOnly && userRole !== "master") return false;
        if (item.agentOnly && userRole !== "agent") return false;
        if (!item.allowedRoles.some((role) => role.toLowerCase() === userRole))
          return false;
        return true;
      });
  }, [sidebarOrder, user]);

  return (
    <div
      className={`h-screen flex flex-col bg-reply-bg/50 dark:bg-reply-bg-dark`}
    >
      <Toaster
        position="top-right"
        richColors
        theme={darkMode ? "dark" : "light"}
      />

      {/* Mobile Header */}
      <div className="md:hidden h-16 bg-white dark:bg-reply-panel-dark border-b border-gray-200 dark:border-reply-border-dark flex items-center justify-between px-4 z-50">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsMobileMenuOpen(true)}
            className="p-2 text-gray-500 dark:text-gray-300"
          >
            <Menu size={24} />
          </button>
          <span className="font-bold text-lg text-gray-800 dark:text-white">
            Reply
          </span>
        </div>

        {/* BLOQUE HEADER: Notificaciones + Avatar */}
        <div className="flex items-center gap-3">
          {/* 1. Campana de Notificaciones */}
          <NotificationBell />

          {/* 2. Divisor Vertical */}
          <div className="h-6 w-px bg-gray-200 dark:bg-gray-700 mx-1 hidden sm:block" />

          {/* 3. Avatar de Usuario (Enterprise Style) */}
          <button
            onClick={() => navigate("/profile")}
            className="w-9 h-9 flex-shrink-0 rounded-full p-[2px] shadow-sm bg-gradient-to-tr from-blue-500 to-teal-400 active:scale-95 transition-transform"
          >
            <div className="w-full h-full rounded-full bg-white dark:bg-gray-800 flex items-center justify-center text-xs font-bold text-gray-600 dark:text-gray-300 relative overflow-hidden">
              {user?.profilePicUrl || user?.avatar ? (
                <img
                  src={user?.profilePicUrl || user?.avatar}
                  alt="Avatar"
                  className="w-full h-full object-cover"
                />
              ) : (
                <span>{user?.name?.slice(0, 2).toUpperCase() || "US"}</span>
              )}
            </div>
          </button>
        </div>
      </div>

      <div className="flex flex-1 h-[calc(100vh-64px)] md:h-screen overflow-hidden relative">
        {/* SIDEBAR */}
        <SidebarEnhanced
          navItems={visibleNavItems}
          currentPath={location.pathname}
          onNavigate={(path) => navigate(path)}
          onReorder={handleDragEnd}
          user={user}
          logout={logout}
          darkMode={darkMode}
          toggleDarkMode={toggleDarkMode}
          isMobileMenuOpen={isMobileMenuOpen}
          setIsMobileMenuOpen={setIsMobileMenuOpen}
        />

        {/* MAIN CONTENT AREA */}
        <main className="flex-1 w-full overflow-hidden relative">
          {/* Top Shadow Gradient for depth */}
          <div className="absolute top-0 left-0 right-0 h-4 bg-gradient-to-b from-black/5 to-transparent pointer-events-none z-10" />
          <div className="h-full w-full overflow-y-auto overflow-x-hidden bg-reply-bg/50 dark:bg-reply-bg-dark">
            <Outlet />
          </div>
        </main>
      </div>

      {/* Global Command Center (Cmd+K / Ctrl+K) */}
      <CommandCenter />
    </div>
  );
};
