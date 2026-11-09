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

// In-flight deduplication & client-side micro-cache for public read endpoints
const inFlightRequests = new Map<string, Promise<any>>();
const clientCache = new Map<string, { data: any; timestamp: number }>();
const CLIENT_CACHE_TTL_MS = 30_000; // 30 seconds

export async function api<T = any>(path: string, options: RequestInit = {}): Promise<T> {
  const method = (options.method || "GET").toUpperCase();
  const isGet = method === "GET" || method === "HEAD";
  const token = getAuthToken();
  const isPublicGet = isGet && !token && (path.startsWith("/books") || path.startsWith("/categories"));

  // Check client in-memory cache for public GETs
  if (typeof window !== "undefined" && isPublicGet && !options.cache) {
    const cached = clientCache.get(path);
    if (cached && Date.now() - cached.timestamp < CLIENT_CACHE_TTL_MS) {
      return cached.data as T;
    }
    // Deduplicate in-flight requests
    if (inFlightRequests.has(path)) {
      return inFlightRequests.get(path) as Promise<T>;
    }
  }

  const fetchPromise = (async () => {
    const headers = new Headers(options.headers);
    if (!(options.body instanceof FormData)) {
      headers.set("Content-Type", "application/json");
    }
    if (!["GET", "HEAD"].includes(method)) {
      headers.set("X-Classes-Request", "web");
    }
    if (token && !headers.has("Authorization")) {
      headers.set("Authorization", `Bearer ${token}`);
    }

    const fetchOptions: RequestInit = {
      ...options,
      headers,
      credentials: "include",
    };

    // If options.cache is explicitly provided, respect it; otherwise allow Next.js / browser caching for GETs
    if (options.cache) {
      fetchOptions.cache = options.cache;
    } else if (!isPublicGet) {
      fetchOptions.cache = "no-store";
    }

    const res = await fetch(`${API}${path}`, fetchOptions);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `Request failed (${res.status})`);
    }
    const data = await res.json();

    if (typeof window !== "undefined" && isPublicGet) {
      clientCache.set(path, { data, timestamp: Date.now() });
    }

    return data as T;
  })();

  if (typeof window !== "undefined" && isPublicGet && !options.cache) {
    inFlightRequests.set(path, fetchPromise);
    try {
      return await fetchPromise;
    } finally {
      inFlightRequests.delete(path);
    }
  }

  return fetchPromise;
}

export async function getBooks(params = new URLSearchParams()) {
  return api<{ items: BookRecord[]; total: number; totalPages?: number; page?: number }>(
    `/books${params.toString() ? `?${params.toString()}` : ""}`
  );
}

export function money(n: number) {
  return `₹${Number(n || 0).toLocaleString("en-IN")}`;
}

export function optimizeImageUrl(url?: string, width?: number): string {
  if (!url) return "/assets/ebook-cover.png";
  if (url.includes("res.cloudinary.com") && url.includes("/upload/")) {
    // Avoid double transformation
    if (!url.includes("/upload/f_") && !url.includes("/upload/q_")) {
      const transform = width ? `f_auto,q_auto,w_${width},c_limit` : "f_auto,q_auto";
      return url.replace("/upload/", `/upload/${transform}/`);
    }
  }
  return url;
}

export function coverUrl(book?: Partial<BookRecord> | null, width?: number): string {
  if (!book) return "/assets/ebook-cover.png";
  const raw = book.thumbnailUrl || book.coverImageUrl || "/assets/ebook-cover.png";
  return optimizeImageUrl(raw, width);
}
