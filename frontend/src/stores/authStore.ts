import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
// Ajusta este path si mueves types.ts a src/types.ts
import { User } from "@/types";

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;

  // Actions
  login: (user: User, token: string) => void;
  logout: () => void;
  updateUser: (updates: Partial<User>) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      isAuthenticated: false,

      login: (user, token) => {
        // We set localStorage manually for Axios interceptor immediate availability
        localStorage.setItem("token", token);
        set({ user, token, isAuthenticated: true });
      },

      logout: () => {
        // 🛡️ SECURE LOGOUT: Hard reset to prevent state contamination

        // 1. Clear token
        localStorage.removeItem("token");

        // 2. Clear Zustand persisted state
        localStorage.removeItem("auth-storage");

        // 3. Clear all other localStorage (prevent sensitive data leaks)
        const keysToKeep = ["theme", "sidebar-collapsed"]; // UI preferences only
        Object.keys(localStorage).forEach((key) => {
          if (!keysToKeep.includes(key)) {
            localStorage.removeItem(key);
          }
        });

        // 4. Clear session storage
        sessionStorage.clear();

        // 5. Reset Zustand state
        set({ user: null, token: null, isAuthenticated: false });

        // 6. CRITICAL: Force full browser reload to clear ALL React state
        // This prevents any stale data in memory (hooks, contexts, etc.)
        window.location.href = "/login";
      },

      updateUser: (updates) => {
        set((state) => ({
          user: state.user ? { ...state.user, ...updates } : null,
        }));
      },
    }),
    {
      name: "auth-storage", // unique name
      storage: createJSONStorage(() => localStorage), // explicit storage
    },
  ),
);
