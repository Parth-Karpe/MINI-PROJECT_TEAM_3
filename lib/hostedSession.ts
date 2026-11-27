import type { NextRequest } from "next/server";
import { STAFF_ACCOUNTS, isUsn } from "./demoFaculty";

function decodeBase64Url(value: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(value.replace(/-/g, "+").replace(/_/g, "/")), char => char.charCodeAt(0));
}

export async function hostedSessionRole(request: NextRequest, configValue: string): Promise<string | null> {
  try {
    const token = request.cookies.get("sc_session")?.value;
    if (!token || token.length > 1024) return null;
    const parts = token.split(".");
    if (parts.length !== 2) return null;
    const [payload, signature] = parts;
    const config = JSON.parse(configValue);
    if (typeof config.secret !== "string" || !config.secret || !Array.isArray(config.accounts)) return null;
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey("raw", encoder.encode(config.secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
    const valid = await crypto.subtle.verify("HMAC", key, decodeBase64Url(signature), encoder.encode(payload));
    if (!valid) return null;
    const { id, expires } = JSON.parse(new TextDecoder().decode(decodeBase64Url(payload)));
    if (typeof id !== "string" || !Number.isSafeInteger(expires) || expires <= Date.now()) return null;
    if (isUsn(id)) return "student";
    const role = STAFF_ACCOUNTS.find(account => account.id === id)?.role
      ?? config.accounts.find((account: { id: string; role?: string }) => account.id === id && account.role !== "student")?.role;
    return ["admin", "hod", "faculty"].includes(role) ? role : null;
  } catch {
    return null;
  }
}
