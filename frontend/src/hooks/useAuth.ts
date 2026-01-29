import { useAuthStore } from "@/stores/authStore";
import { User } from "@/types/auth.types"; // Using direct type path to avoid cyclic deps if any

export interface AuthContextType {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  login: (user: User, token: string) => void;
  logout: () => void;
  updateUser: (updates: Partial<User>) => void;
}

/**
 * 🔐 useAuth Hook
 * Centralized Authentication logic.
 * Wraps Zustand store to provide a clean API for components.
 * replaces: localStorage.getItem('token') in components
 */
export const useAuth = (): AuthContextType => {
  const store = useAuthStore();

  return {
    user: store.user,
    token: store.token,
    isAuthenticated: store.isAuthenticated,
    login: store.login,
    logout: store.logout,
    updateUser: store.updateUser,
  };
};
