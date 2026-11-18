"use client";

import { useRef, useState } from "react";
import { DEMO_FACULTY } from "@/lib/demoFaculty";

const roles = [
  { id: "student", label: "Student" },
  { id: "faculty", label: "Faculty" },
  { id: "hod", label: "HOD" },
] as const;
type DemoRole = (typeof roles)[number]["id"];

export default function DemoLogin() {
  const [role, setRole] = useState<DemoRole | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const teacher = useRef<HTMLSelectElement>(null);

  async function enter(demoRole: DemoRole, facultyId?: string) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ demoRole, facultyId }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      window.location.assign("/dashboards/" + result.user.role);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not open the dashboard.");
      setBusy(false);
    }
  }

  function selectRole(next: DemoRole) {
    setRole(next);
    setError("");
    if (next !== "faculty") void enter(next);
    else requestAnimationFrame(() => teacher.current?.focus());
  }

  return <div className="portal-login">
    <section className="portal-login-card" aria-labelledby="portal-login-title" aria-busy={busy}>
      <header className="portal-login-header">
        <h1 id="portal-login-title">Sign in to Portal</h1>
        <span className="portal-demo-label">Demo access</span>
      </header>
      <div className="portal-role-buttons" role="group" aria-label="Choose your role">
        {roles.map(item => <button key={item.id} type="button" disabled={busy}
          aria-pressed={role === item.id}
          aria-expanded={item.id === "faculty" ? role === "faculty" : undefined}
          aria-controls={item.id === "faculty" ? "portal-faculty-picker" : undefined}
          onClick={() => selectRole(item.id)}>{item.label}</button>)}
      </div>
      <div id="portal-faculty-picker" className="portal-faculty-picker" hidden={role !== "faculty"}>
        <label htmlFor="portal-teacher">Teacher</label>
        <select id="portal-teacher" ref={teacher} value="" disabled={busy} onChange={event => {
          if (event.target.value) void enter("faculty", event.target.value);
        }}>
          <option value="" disabled>Select a teacher</option>
          {DEMO_FACULTY.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </div>
      <fieldset className="portal-credentials" disabled>
        <label htmlFor="portal-usn">University Seat Number (USN) or College Email</label>
        <input id="portal-usn" type="text" placeholder="Enter USN or email" />
        <label htmlFor="portal-password">Password</label>
        <input id="portal-password" type="password" placeholder="Enter password" />
      </fieldset>
      {error && <p className="portal-login-error" role="alert">{error}</p>}
    </section>
  </div>;
}
