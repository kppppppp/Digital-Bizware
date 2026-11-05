import type { BookRecord } from "@classes/shared";

export const API = (process.env.NEXT_PUBLIC_API_URL || "https://digital-bizware-1.onrender.com/api").replace(/\/$/, "");

const TOKEN_KEY = "classes_token";

export function getAuthToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setAuthToken(token: string | null | undefined): void {
  if (typeof window === "undefined") return;
  try {
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_KEY);
    }
  } catch {}
}

export function clearAuthToken(): void {
  setAuthToken(null);
}

export async function api<T = any>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (!(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  if (!["GET", "HEAD"].includes(options.method || "GET")) {
    headers.set("X-Classes-Request", "web");
  }
  const token = getAuthToken();
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers,
    credentials: "include",
    cache: "no-store",
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return res.json();
}

export async function getBooks(params = new URLSearchParams()) {
  return api<{ items: BookRecord[]; total: number; totalPages?: number; page?: number }>(
    `/books${params.toString() ? `?${params.toString()}` : ""}`
  );
}

export function money(n: number) {
  return `₹${Number(n || 0).toLocaleString("en-IN")}`;
}

export function coverUrl(book?: Partial<BookRecord>) {
  if (!book) return "/assets/ebook-cover.png";
  return book.thumbnailUrl || book.coverImageUrl || "/assets/ebook-cover.png";
}
