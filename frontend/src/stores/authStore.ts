import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { User } from "@/types";

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;

  // Actions
  login: (user: User, token: string) => void;
  logout: () => void;
  updateUser: (updates: Partial<User>) => void;
  updateToken: (token: string) => void;
}

//  API Base URL for server-side logout
const API_BASE =
  (import.meta.env.VITE_API_URL as string) || "http://localhost:4000/api";

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      isAuthenticated: false,

      login: (user, token) => {
        // We set localStorage manually for Axios interceptor immediate availability
        localStorage.setItem("token", token);
        set({ user, token, isAuthenticated: true });
      },

      /**
       *  ENTERPRISE LOGOUT
       * 1. Calls backend to destroy session + blacklist token (server-side)
       * 2. Clears local state
       * 3. Redirects to login
       */
      logout: () => {
        const currentToken = get().token;

        //  Server-side session destruction (fire-and-forget)
        // Uses fetch directly to avoid circular dependency with axios interceptor
        if (currentToken) {
          fetch(`${API_BASE}/auth/logout`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${currentToken}`,
              "Content-Type": "application/json",
            },
            credentials: "include", // Send cookies
          }).catch(() => {
            // Non-critical: session will expire naturally if server unreachable
          });
        }

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
        window.location.href = "/login";
      },

      /**
       * [SYNC] Update access token after silent refresh.
       * Called by axios interceptor when refresh succeeds.
       */
      updateToken: (token: string) => {
        localStorage.setItem("token", token);
        set({ token });
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
