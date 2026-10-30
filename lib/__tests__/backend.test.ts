import { afterEach, describe, expect, it, vi } from "vitest";
import { forwardToEngine } from "../backend";

describe("forwardToEngine (server bridge to the Python engine)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
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
