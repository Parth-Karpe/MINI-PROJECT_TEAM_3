import { describe, it, expect, vi, afterEach } from "vitest";
import { NextRequest } from "next/server";
const files = vi.hoisted(() => new Map<string, string>());
vi.mock("node:fs", () => ({ existsSync: (p: string) => files.has(p), mkdirSync: () => {}, readFileSync: (p: string) => { if (!files.has(p)) throw new Error("missing"); return files.get(p); }, writeFileSync: (p: string, s: string) => files.set(p, String(s)) }));
import { authenticateStaff, identityFromCookie, signSession, studentIdentity } from "../localAuth";
import { hostedSessionRole } from "../hostedSession";

afterEach(() => { delete process.env.CAMPUS_AUTH_CONFIG_JSON; });

describe("demo sign-in", () => {
  it("accepts student USNs of the form 01FE24BCI###, case-insensitively", () => {
    expect(studentIdentity("01fe24bci062")).toMatchObject({ id: "01FE24BCI062", name: "Parth Karpe", role: "student", semester: 5, section: "A", batch: "A1" });
    expect(studentIdentity(" 01FE24BCI145 ")?.name).toBe("01FE24BCI145");
    for (const bad of ["01FE23BCI062", "01FE24BCI62", "01FE24BCI0621", "PARTH", "", null]) expect(studentIdentity(bad)).toBeNull();
  });
  it("lets staff in only with password 123 and their own role", () => {
    expect(authenticateStaff("faculty", "sv", "123")).toMatchObject({ id: "SV", facultyId: "SV" });
    expect(authenticateStaff("hod", "HOD-CSAI", "123")?.role).toBe("hod");
    expect(authenticateStaff("admin", "ADMIN", "123")?.role).toBe("admin");
    expect(authenticateStaff("faculty", "SV", "124")).toBeNull();
    expect(authenticateStaff("admin", "AK", "123")).toBeNull();
    expect(authenticateStaff("faculty", "NOBODY", "123")).toBeNull();
  });
  it("round-trips student and staff sessions and rejects forged cookies", () => {
    const student = signSession(studentIdentity("01FE24BCI062")!);
    expect(identityFromCookie("sc_session=" + student)?.role).toBe("student");
    expect(identityFromCookie("sc_session=" + signSession(authenticateStaff("hod", "HOD-CSAI", "123")!))?.role).toBe("hod");
    const [, sig] = student.split(".");
    const forged = Buffer.from(JSON.stringify({ id: "ADMIN", expires: Date.now() + 10000 })).toString("base64url");
    expect(identityFromCookie(`sc_session=${forged}.${sig}`)).toBeNull();
  });
  it("hosted middleware recognises USN and built-in staff sessions", async () => {
    const config = JSON.stringify({ secret: "s3cret", accounts: [] });
    process.env.CAMPUS_AUTH_CONFIG_JSON = config;
    const req = (token: string) => new NextRequest("https://example.test/dashboards/student", { headers: { cookie: "sc_session=" + token } });
    expect(await hostedSessionRole(req(signSession(studentIdentity("01FE24BCI062")!)), config)).toBe("student");
    expect(await hostedSessionRole(req(signSession(authenticateStaff("faculty", "AK", "123")!)), config)).toBe("faculty");
    expect(await hostedSessionRole(req("bad.token"), config)).toBeNull();
  });
});
