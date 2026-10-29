/**
 * Server-side bridge to the Python Algorithm Engine microservice.
 * Keeps ALGORITHM_ENGINE_URL and credentials securely on the server side.
 */

const ENGINE_URL = process.env.ALGORITHM_ENGINE_URL || "http://127.0.0.1:8000";

export async function forwardToEngine(
  endpoint: string,
  options: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  } = {}
): Promise<{ status: number; data: any }> {
  const url = `${ENGINE_URL}${endpoint.startsWith("/") ? "" : "/"}${endpoint}`;
  try {
    const res = await fetch(url, {
      method: options.method || "GET",
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
      body: options.body,
      cache: "no-store",
    });

    const data = await res.json().catch(() => ({}));
    return { status: res.status, data };
  } catch (err: any) {
    return {
      status: 503,
      data: {
        detail:
          err.message ||
          "Algorithm Engine microservice unreachable. Please ensure the Python service is running on port 8000.",
      },
    };
  }
}
