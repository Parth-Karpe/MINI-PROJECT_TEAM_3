"use client";

import { useState } from "react";
import { DEMO_FACULTY, STAFF_ACCOUNTS, isUsn, normalizeUsn } from "@/lib/demoFaculty";

const roles = [
  { id: "student", label: "Student" },
  { id: "faculty", label: "Faculty" },
  { id: "hod", label: "HOD" },
  { id: "admin", label: "Admin" },
] as const;
type LoginRole = (typeof roles)[number]["id"];

const accountFor = (role: "hod" | "admin") => STAFF_ACCOUNTS.find(a => a.role === role)!;

export default function DemoLogin() {
  const [role, setRole] = useState<LoginRole>("student");
  const [usn, setUsn] = useState("");
  const [facultyId, setFacultyId] = useState<string>(DEMO_FACULTY[0].id);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const label = roles.find(item => item.id === role)!.label;

  async function enter() {
    setError("");
    if (role === "student" && !isUsn(usn)) { setError("Enter a valid USN, for example 01FE24BCI062."); return; }
    setBusy(true);
    try {
      const id = role === "faculty" ? facultyId : role === "student" ? undefined : accountFor(role).id;
      const response = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(role === "student" ? { role, usn: normalizeUsn(usn) } : { role, id, password }),
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
        <h1 id="portal-login-title">Welcome to Smart Campus Portal</h1>
      </header>
      <form onSubmit={event => { event.preventDefault(); void enter(); }}>
        <div className="portal-role-buttons" role="group" aria-label="Choose your role">
          {roles.map(item => <button key={item.id} type="button" disabled={busy}
            aria-pressed={role === item.id}
            onClick={() => { setRole(item.id); setError(""); setPassword(""); }}>{item.label}</button>)}
        </div>
        {role === "student" ? <div className="portal-account">
          <label htmlFor="portal-usn">USN</label>
          <input id="portal-usn" value={usn} disabled={busy} placeholder="01FE24BCI062" autoComplete="username"
            onChange={event => setUsn(event.target.value)} />
        </div> : <>
          {role === "faculty" ? <div className="portal-account">
            <label htmlFor="portal-teacher">Teacher</label>
            <select id="portal-teacher" value={facultyId} disabled={busy} onChange={event => setFacultyId(event.target.value)}>
              {DEMO_FACULTY.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </div> : <div className="portal-account">
            <label htmlFor="portal-account-name">{label}</label>
            <input id="portal-account-name" value={accountFor(role).name} readOnly />
          </div>}
          <div className="portal-account">
            <label htmlFor="portal-password">Password</label>
            <input id="portal-password" type="password" value={password} disabled={busy} autoComplete="current-password"
              onChange={event => setPassword(event.target.value)} />
          </div>
        </>}
        <button type="submit" className="portal-submit" disabled={busy}>
          {busy ? "Signing in…" : `Sign in as ${label} →`}
        </button>
      </form>
      {error && <p className="portal-login-error" role="alert">{error}</p>}
    </section>
  </div>;
}
