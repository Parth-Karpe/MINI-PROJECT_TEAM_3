/**
 * Client-side API helpers for the Next.js frontend.
 *
 * Calls go through the Next.js Route Handlers (app/api/**), which in turn
 * forward to the Python Algorithm Engine microservice (lib/engine.ts).
 * Kept separate from the server-only facade on purpose.
 */

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const detail = data?.detail;
    const message =
      typeof detail === "string"
        ? detail
        : JSON.stringify(detail ?? res.statusText ?? "Request failed");
    throw new ApiError(res.status, message);
  }
  return data as T;
}

export function apiGet<T>(url: string): Promise<T> {
  return apiFetch<T>(url);
}

export function apiPost<T>(url: string, body?: unknown, headers?: Record<string, string>): Promise<T> {
  return apiFetch<T>(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(headers || {}),
    },
    body: body === undefined ? JSON.stringify({}) : JSON.stringify(body),
  });
}
