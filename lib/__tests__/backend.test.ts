import { afterEach, describe, expect, it, vi } from "vitest";
import { forwardToEngine } from "../backend";
vi.mock("../localAuth",()=>({authConfig:()=>({secret:"test-only-review-key"})}));

describe("forwardToEngine (server bridge to the Python engine)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("returns a configuration error on Vercel without contacting localhost", async () => {
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("ALGORITHM_ENGINE_URL", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const res = await forwardToEngine("/health");
    expect(res.status).toBe(503);
    expect(res.data.detail).toContain("ALGORITHM_ENGINE_URL");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses the configured engine and keeps its secret in the server request", async () => {
    vi.stubEnv("ALGORITHM_ENGINE_URL", "https://engine.example.test/");
    vi.stubEnv("ENGINE_API_SECRET", "test-only-secret");
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}"));
    vi.stubGlobal("fetch", fetchMock);
    await forwardToEngine("/health");
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("https://engine.example.test/health");
    expect(init.headers["X-Engine-Api-Key"]).toBe("test-only-secret");
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("forwards a GET with query params and returns the engine payload", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: "ok" }), { status: 200, headers: { "Content-Type": "application/json" } })
    );
    vi.stubGlobal("fetch", fetchMock);

    const res = await forwardToEngine<{ status: string }>("/admin/state", {
      query: { window_start: "2026-10-29T00:00:00", window_end: "2026-11-12T00:00:00" },
    });

    expect(res.status).toBe(200);
    expect(res.data).toEqual({ status: "ok" });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toContain("/admin/state");
    expect(String(url)).toContain("window_start=2026-10-29");
    expect(String(url)).toContain("window_end=2026-11-12");
    expect(init.method).toBe("GET");
  });

  it("forwards a POST with a JSON body", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: "reset" }), { status: 200, headers: { "Content-Type": "application/json" } })
    );
    vi.stubGlobal("fetch", fetchMock);

    const res = await forwardToEngine<{ status: string }>("/reset", {
      method: "POST",
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(200);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toContain("/reset");
    expect(init.method).toBe("POST");
    expect(String(init.body)).toBe("{}");
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
  });

  it("returns a 503 envelope when the engine is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));

    const res = await forwardToEngine("/health");

    expect(res.status).toBe(503);
    expect(typeof res.data.detail).toBe("string");
  });
});
