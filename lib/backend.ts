/**
 * Server-side bridge to the Python Algorithm Engine microservice.
 * Keeps ALGORITHM_ENGINE_URL and credentials securely on the server side.
 *
 * The Next.js Route Handlers use this to forward API calls to the engine's
 * FastAPI service (see api/main.py). The engine itself is a separate Python
 * runtime on purpose: the allocation pipeline (interval trees, weighted
 * interval scheduling DP, aging) is implemented in Python and must not be
 * re-implemented in TypeScript.
 */

export interface EngineResponse<T = Record<string, unknown>> {
  status: number;
  data: T;
}

const ENGINE_KEY_HEADER = "X-Engine-Api-Key";

export async function forwardToEngine<T = Record<string, unknown>>(
  endpoint: string,
  options: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    query?: Record<string, string | number | undefined>;
  } = {}
): Promise<EngineResponse<T>> {
  const engineUrl = process.env.ALGORITHM_ENGINE_URL;
  if (process.env.VERCEL && !engineUrl) {
    return {
      status: 503,
      data: { detail: "The Python engine is not configured for this preview. Set ALGORITHM_ENGINE_URL to its hosted HTTPS address." } as T,
    };
  }
  const base = (engineUrl || "http://127.0.0.1:8000").replace(/\/+$/, "");
  const url = new URL(`${base}${endpoint.startsWith("/") ? "" : "/"}${endpoint}`);
  if (options.query) {
    for (const [key, value] of Object.entries(options.query)) {
      if (value === undefined || value === null || value === "") continue;
      url.searchParams.set(key, String(value));
    }
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };
  const { authConfig } = await import("./localAuth");
  headers["X-Review-Key"] = authConfig().secret;
  if (process.env.ENGINE_API_SECRET) {
    headers[ENGINE_KEY_HEADER] = process.env.ENGINE_API_SECRET;
  }

  let body: BodyInit | undefined;
  if (options.body) body = options.body;

  try {
    const res = await fetch(url, {
      method: options.method || "GET",
      headers,
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });

    let data: T;
    try {
      data = (await res.json()) as T;
    } catch {
      data = {} as T;
    }
    return { status: res.status, data };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return {
      status: 503,
      data: {
        detail:
          message ||
          "Algorithm Engine microservice unreachable. Please ensure the Python service is running on port 8000.",
      } as T,
    };
  }
}
