"use client";

import { useState } from "react";
import { DEMO_FACULTY } from "@/lib/demoFaculty";

const roles = [
  { id: "student", label: "Student" },
  { id: "faculty", label: "Faculty" },
  { id: "hod", label: "HOD" },
] as const;
type DemoRole = (typeof roles)[number]["id"];

export default function DemoLogin() {
  const [role, setRole] = useState<DemoRole>("student");
  const [facultyId, setFacultyId] = useState<string>(DEMO_FACULTY[0].id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const label = roles.find(item => item.id === role)!.label;

  async function enter() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ demoRole: role, facultyId: role === "faculty" ? facultyId : undefined }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      window.location.assign("/dashboards/" + result.user.role);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not open the dashboard.");
      setBusy(false);
    }
  }

  return <div className="portal-login">
    <section className="portal-login-card" aria-labelledby="portal-login-title" aria-busy={busy}>
      <header className="portal-login-header">
        <h1 id="portal-login-title">Sign in to Workspace</h1>
      </header>
      <form onSubmit={event => { event.preventDefault(); void enter(); }}>
        <div className="portal-role-buttons" role="group" aria-label="Choose your role">
          {roles.map(item => <button key={item.id} type="button" disabled={busy}
            aria-pressed={role === item.id}
            onClick={() => { setRole(item.id); setError(""); }}>{item.label}</button>)}
        </div>
        {role === "faculty" ? <div className="portal-account">
          <label htmlFor="portal-teacher">Teacher</label>
          <select id="portal-teacher" value={facultyId} disabled={busy} onChange={event => setFacultyId(event.target.value)}>
            {DEMO_FACULTY.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </div> : <div className="portal-account">
          <label htmlFor="portal-demo-account">Demo account ID</label>
          <input id="portal-demo-account" value={role === "student" ? "PARTH" : "HOD-CSAI"} readOnly />
        </div>}
        <button type="submit" className="portal-submit" disabled={busy}>
          {busy ? "Signing in…" : `Sign in as ${label} →`}
        </button>
      </form>
      {error && <p className="portal-login-error" role="alert">{error}</p>}
    </section>
  </div>;
}
