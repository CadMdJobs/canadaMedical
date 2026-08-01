import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export type UserType = "physician" | "employer" | "admin" | null;

export interface AuthUser {
  id?: number | string;
  email: string;
  first_name?: string;
  last_name?: string;
  full_name?: string;
  user_type?: UserType;
  is_admin?: boolean;
  specialty?: string;
  company_name?: string;
  [key: string]: unknown;
}

interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  userType: UserType;
  isAdmin: boolean;
  hydrated: boolean;

  login: (payload: { user: AuthUser; access: string; refresh: string }) => void;
  logout: () => void;
  updateTokens: (access: string, refresh: string) => void;
  setUser: (user: AuthUser) => void;
  setHydrated: () => void;

  /** Returns true if the stored access token is expired (JWT exp claim). */
  isTokenExpired: () => boolean;
}

function decodeJwtExp(token: string): number | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const decoded = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
    return typeof decoded.exp === "number" ? decoded.exp : null;
  } catch {
    return null;
  }
}

const CLEARED_STATE = {
  user: null,
  accessToken: null,
  refreshToken: null,
  isAuthenticated: false,
  userType: null as UserType,
  isAdmin: false,
} as const;

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      ...CLEARED_STATE,
      hydrated: false,

      login: ({ user, access, refresh }) =>
        set({
          user,
          accessToken: access,
          refreshToken: refresh,
          isAuthenticated: true,
          userType: (user.user_type as UserType) ?? null,
          isAdmin: !!user.is_admin,
        }),

      logout: () => {
        // Fire-and-forget blacklist — never block the UI on this
        const { refreshToken } = get();
        if (refreshToken) {
          const base = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");
          // Use plain fetch to avoid circular dependency with the axios instance
          fetch(`${base}/api/v1/auth/logout/`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ refresh: refreshToken }),
          }).catch(() => {});
        }
        set(CLEARED_STATE);
      },

      updateTokens: (access, refresh) =>
        set({ accessToken: access, refreshToken: refresh }),

      setUser: (user) =>
        set({
          user,
          userType: (user.user_type as UserType) ?? null,
          isAdmin: !!user.is_admin,
        }),

      setHydrated: () => set({ hydrated: true }),

      isTokenExpired: () => {
        const token = get().accessToken;
        if (!token) return true;
        const exp = decodeJwtExp(token);
        if (exp === null) return false; // can't decode → assume valid
        // Consider expired 30s before actual expiry to avoid edge-case 401s
        return Date.now() / 1000 > exp - 30;
      },
    }),
    {
      name: "canadamed-auth", // fixed from the typo "CandianMdJobs-auth"
      storage: createJSONStorage(() =>
        typeof window !== "undefined"
          ? window.localStorage
          : (undefined as unknown as Storage),
      ),
      partialize: (s) => ({
        user: s.user,
        accessToken: s.accessToken,
        refreshToken: s.refreshToken,
        isAuthenticated: s.isAuthenticated,
        userType: s.userType,
        isAdmin: s.isAdmin,
      }),
      onRehydrateStorage: () => (state) => state?.setHydrated(),
    },
  ),
);
