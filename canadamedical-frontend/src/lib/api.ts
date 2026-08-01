import axios, { AxiosError, type InternalAxiosRequestConfig } from "axios";
import { useAuthStore } from "@/stores/auth";

// VITE_API_URL is injected at build time by CI. In local dev it comes from .env.
// No runtime fallback to a hard-coded URL — fail loudly if misconfigured.
const rawBase = import.meta.env.VITE_API_URL;
if (!rawBase && import.meta.env.PROD) {
  throw new Error("VITE_API_URL is not set. Rebuild the frontend with the correct env var.");
}
const baseURL = (rawBase || "http://localhost:8000").replace(/\/$/, "");

export const api = axios.create({
  baseURL,
  headers: { "Content-Type": "application/json" },
  timeout: 30_000,
});

// ── Request interceptor: attach JWT + correlation ID ─────────────────────────
api.interceptors.request.use((config) => {
  if (typeof window === "undefined") return config;

  const token = useAuthStore.getState().accessToken;
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  // Propagate a per-request trace ID for server-side log correlation
  config.headers["X-Request-ID"] =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);

  return config;
});

// ── Token refresh: single in-flight promise, no concurrent refresh storms ────
let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const { refreshToken, updateTokens, logout } = useAuthStore.getState();
  if (!refreshToken) return null;

  try {
    const res = await axios.post(
      `${baseURL}/api/v1/auth/token/refresh/`,
      { refresh: refreshToken },
      { timeout: 10_000 },
    );
    const newAccess: string = res.data.access;
    const newRefresh: string = res.data.refresh ?? refreshToken;
    updateTokens(newAccess, newRefresh);
    return newAccess;
  } catch {
    logout();
    if (typeof window !== "undefined") window.location.replace("/login");
    return null;
  }
}

// ── Response interceptor: 401 → refresh once → retry ─────────────────────────
api.interceptors.response.use(
  (r) => r,
  async (error: AxiosError) => {
    const original = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    // Only attempt refresh on 401s from our API, and only once per request
    if (
      error.response?.status === 401 &&
      original &&
      !original._retry &&
      !original.url?.includes("/auth/token/refresh/")
    ) {
      original._retry = true;
      refreshPromise = refreshPromise ?? refreshAccessToken();
      const token = await refreshPromise;
      refreshPromise = null;

      if (token) {
        original.headers = original.headers ?? {};
        (original.headers as Record<string, string>).Authorization = `Bearer ${token}`;
        return api(original);
      }
    }

    return Promise.reject(error);
  },
);

// ── Response shape helpers ────────────────────────────────────────────────────

/** Extract the `.data` payload from a success_response envelope. */
export function extractData<T>(res: { data: unknown }): T {
  const envelope = res.data as Record<string, unknown> | undefined;
  return (envelope?.data ?? envelope) as T;
}

/** Extract a list from either a paginated or flat success_response. */
export function extractList<T>(res: { data: unknown }): T[] {
  const envelope = res.data as Record<string, unknown> | undefined;
  const inner = (envelope?.data ?? envelope) as unknown;
  if (Array.isArray(inner)) return inner as T[];
  if (inner && typeof inner === "object") {
    const r = (inner as Record<string, unknown>).results;
    if (Array.isArray(r)) return r as T[];
  }
  return [];
}

/** Extract pagination metadata from a paginated response. */
export function extractPagination(res: { data: unknown }): {
  count: number;
  next: string | null;
  previous: string | null;
} {
  const d = res.data as Record<string, unknown> | undefined;
  return {
    count: (d?.count as number) ?? 0,
    next: (d?.next as string) ?? null,
    previous: (d?.previous as string) ?? null,
  };
}

/** Human-readable error string from any Axios error or plain Error. */
export function apiError(e: unknown): string {
  if (axios.isAxiosError(e)) {
    const data = e.response?.data as Record<string, unknown> | undefined;
    if (data) {
      if (typeof data.message === "string" && data.message) return data.message;
      if (typeof data.detail === "string" && data.detail) return data.detail;
      // DRF field-level errors: { email: ["already exists"] }
      const firstKey = Object.keys(data).find((k) => k !== "success");
      const firstVal = firstKey ? data[firstKey] : undefined;
      if (Array.isArray(firstVal) && typeof firstVal[0] === "string")
        return `${firstKey}: ${firstVal[0]}`;
      if (typeof firstVal === "string") return `${firstKey}: ${firstVal}`;
    }
    if (e.code === "ECONNABORTED") return "Request timed out. Please try again.";
    return e.message || "Network error";
  }
  return e instanceof Error ? e.message : "Something went wrong";
}
