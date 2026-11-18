"use client";
import { useCallback, useEffect, useState } from "react";
import type { DashboardSection } from "@/lib/dashboardPages";
import { ScheduleImports } from "./ScheduleImports";
import { CampusWorkflows } from "./CampusWorkflows";
import type { Identity } from "@/lib/localAuth";
import { StaffImport } from "./StaffImport";
import { FairnessPreview } from "./FairnessPreview";
import { DashboardClock, useDashboardClock } from "./DashboardClock";
import { WeeklyTimetable } from "./WeeklyTimetable";
import { DAYS, DEMO_USERS, minutes, type PublicationState, type PublishedSession, type Role, type CsvResource } from "@/lib/publishedTimetable";

type Occupancy = Pick<PublishedSession, "day" | "start_time" | "end_time" | "room_id" | "session_type">;
type ViewState = PublicationState & { resources?: CsvResource[]; draftResources?: CsvResource[]; occupancy?: Occupancy[] };
const Timetable = WeeklyTimetable;
export function RoleDashboard({ role, section: page, title }: { role: Role; section?: DashboardSection; title?: string }) {
  const [user,setUser] = useState<Identity|null>(null);
  useEffect(()=>{fetch("/api/session").then(r=>r.json()).then(d=>setUser(d.user));},[]);
  const [termStart,setTermStart]=useState("2026-09-07"),[termEnd,setTermEnd]=useState("2026-12-29");
  const [state, setState] = useState<ViewState | null>(null), [error, setError] = useState("");
  const [notice, setNotice] = useState(""), [busy, setBusy] = useState(false);
  const [semester, setSemester] = useState(5);
  const [section, setSection] = useState("A"), [batch, setBatch] = useState("A1"), [facultyId, setFacultyId] = useState("AK");
  const [day, setDay] = useState("Mon"), [start, setStart] = useState("09:00"), [end, setEnd] = useState("10:00");
  const refresh = useCallback(async () => {
    try {
      const response = await fetch(`/api/publication?role=${role}`, { cache: "no-store" }); const data = await response.json();
      if (!response.ok) throw new Error(data.error); setState(data); setError("");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not load dashboard."); }
  }, [role]);
  useEffect(() => { setState(null); void refresh(); const timer = setInterval(refresh, 10000); return () => clearInterval(timer); }, [refresh]);
  useEffect(() => { if (state) { setSemester(state.studentSemester || 5); setSection(state.studentSection); setBatch(state.studentBatch); setFacultyId(state.facultyId); } }, [state?.studentSemester, state?.studentSection, state?.studentBatch, state?.facultyId]); // eslint-disable-line react-hooks/exhaustive-deps
  async function act(payload: Record<string, unknown>, message: string) {
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/publication", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...payload, role }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error);
      await refresh(); setNotice(message);
    } catch (e) { setError(e instanceof Error ? e.message : "Action failed."); } finally { setBusy(false); }
  }
  const clock = useDashboardClock(role !== "admin");
  const admin = role === "admin", hod = role === "hod", reviewer = admin || hod;
  const rows = state?.approved?.rows || [];
  const occupancy: Occupancy[] = state?.occupancy || rows;
  const rooms = [...new Set(occupancy.map(r => r.room_id))].sort();
  const weeklyHours = rows.reduce((n,r) => n + (minutes(r.end_time) - minutes(r.start_time)) / 60, 0);
  const availabilityValid = !!start && !!end && minutes(start) >= 480 && minutes(end) <= 1020 && minutes(end) > minutes(start);
  const roomType = (id: string) => state?.resources?.find(r => r.id === id)?.type || "unverified";
  const freeRooms = rooms.filter(id => (role !== "student" || roomType(id) === "classroom") && !occupancy.some(r => r.room_id === id && r.day === day && minutes(r.start_time) < minutes(end) && minutes(start) < minutes(r.end_time)));
  return <div className="rd-dashboard">
    <header className="rd-header"><div><h1>{title || (role==='hod'?'HOD':role.charAt(0).toUpperCase() + role.slice(1)) + " Dashboard"}</h1><p>{user?.name || DEMO_USERS[role].name} · {role === "faculty" ? user?.facultyId || "AK" : user?.id || DEMO_USERS[role].id}{role === "student" && state ? ` · Semester ${state.studentSemester || 5} · Section ${state.studentSection} / ${state.studentBatch}` : ""}</p></div><button onClick={refresh}>Refresh</button></header>
    {!admin && <DashboardClock {...clock} />}
    {error && <p role="alert" className="rd-error">{error}</p>}{notice && <p role="status" className="rd-success">{notice}</p>}
    {!state ? <p>Loading dashboard…</p> : <>
      {!page && <div className="rd-stats"><div><small>Publication</small><strong>{state.approved ? "Approved" : "Not published"}</strong></div><div><small>{reviewer ? "Published sessions" : "My sessions"}</small><strong>{rows.length}</strong></div><div><small>{reviewer ? "Known rooms" : "Weekly teaching / study hours"}</small><strong>{reviewer ? rooms.length : weeklyHours}</strong></div><div><small>{reviewer ? "Awaiting HOD review" : "Semester"}</small><strong>{reviewer ? state.draft ? "Yes" : "No" : role === "student" ? String(state.studentSemester || 5) : "1 / 3 / 5 / 7"}</strong></div></div>}
      {admin && <ScheduleImports draft={state.draft} approved={state.approved} busy={busy} submit={act} />}
      {admin && <StaffImport records={state.staff || []} onSaved={refresh} />}
      {admin && <section className="rd-panel"><h2>Demo account mappings</h2><div className="rd-actions"><label>Amit K · faculty ID<input value={facultyId} onChange={e => setFacultyId(e.target.value)} /></label><label>Student semester<select value={semester} onChange={e => setSemester(Number(e.target.value))}>{[1,3,5,7].map(n => <option key={n}>{n}</option>)}</select></label><label>Parth Karpe · section<select value={section} onChange={e => { setSection(e.target.value); setBatch(`${e.target.value}1`); }}><option>A</option><option>B</option></select></label><label>Lab batch<select value={batch} onChange={e => setBatch(e.target.value)}><option>{section}1</option><option>{section}2</option></select></label><button disabled={busy} onClick={() => act({ action: "mapping", semester, section, batch, facultyId }, "Demo mappings saved.")}>Save mappings</button></div></section>}
      {(admin || page === "review") && <section className="rd-panel"><h2>{hod ? "Review and approve" : "Draft status"}</h2>{state.draft ? <><p><strong>{state.draft.filename}</strong> · {state.draft.rows.length} sessions · Uploaded {new Date(state.draft.uploadedAt).toLocaleString()}</p><p className={state.draft.findings.length ? "rd-error" : "rd-success"}>{state.draft.findings.length ? `${state.draft.findings.length} blocking conflict(s)` : "Faculty, room and section/batch overlap checks passed."}</p>{state.draft.findings.length > 0 && <ul>{state.draft.findings.map((f,i) => <li key={i}>{f}</li>)}</ul>}<p className="rd-note">L:T:P is checked against imported contact-hour requirements; missing requirements remain unverified. Capacity is checked against known room capacities at publication. Publication runs final validation in the Python backend.</p><Timetable rows={state.draft.rows} clock={clock.now} />{hod && <div className="rd-actions"><label>Term starts<input type="date" onInput={e=>setTermStart(e.currentTarget.value)} value={termStart} onChange={e=>setTermStart(e.target.value)}/></label><label>Term ends<input type="date" onInput={e=>setTermEnd(e.currentTarget.value)} value={termEnd} onChange={e=>setTermEnd(e.target.value)}/></label></div>}{hod && <button className="rd-primary" disabled={busy || !!state.draft.findings.length} onClick={() => act({ action: "approve", draftId: state.draft!.id, termStart, termEnd }, "Timetable approved and published to faculty and students.")}>Approve and publish timetable</button>}</> : <p className="rd-empty">No draft awaiting review. Admin can upload the existing timetable.</p>}</section>}
      {hod && page === "reports" && <section className="rd-panel"><h2>Scheduled resource utilization</h2><p>Published timetable only · Mon–Sat, 08:00–17:00 · 54 available hours per room/week. Measures scheduled occupancy, not actual attendance.</p>{!rows.length ? <p className="rd-empty">Statistics appear after approval.</p> : rooms.map(room => { const intervals = rows.filter(r => r.room_id === room); const used = DAYS.reduce((total,d) => { const spans = intervals.filter(r => r.day === d).map(r => [minutes(r.start_time), minutes(r.end_time)]).sort((a,b) => a[0]-b[0]); let end = 0, sum = 0; for (const [s,e] of spans) { sum += Math.max(0, e-Math.max(s,end)); end=Math.max(end,e); } return total+sum/60; },0); return <div className="rd-usage" key={room}><div><strong>{room}</strong><span>{used.toFixed(1)} / 54 hrs · {(used/54*100).toFixed(1)}%</span></div><progress max={54} value={used} /></div>; })}</section>}
      {hod && page === "reports" && <FairnessPreview rooms={rooms} />}
      {(admin || page === "timetable") && <section className="rd-panel"><h2>{reviewer ? "Published timetable" : "My approved timetable"}</h2>{state.approved ? <><p className="rd-note">Approved {new Date(state.approved.approvedAt!).toLocaleString()}</p><Timetable rows={rows} compact={role === "student"} clock={clock.now} /></> : <p className="rd-empty">Waiting for HOD approval. Draft sessions are not published here.</p>}</section>}
      {admin && <section className="rd-panel"><h2>Resource inventory</h2><p>Imported resources and rooms from the published timetable.</p><div className="rd-table-wrap"><table><thead><tr><th>ID</th><th>Type</th><th>Capacity</th><th>Building</th></tr></thead><tbody>{(state.resources || []).map(r => <tr key={r.id}><td>{r.id}</td><td>{r.type || "Unverified"}</td><td>{r.capacity || "Unknown"}</td><td>{r.building || "Unknown"}</td></tr>)}</tbody></table></div></section>}
      {(admin || (page && page !== "review")) && <CampusWorkflows role={role} section={page} facultyId={user?.facultyId}
        userId={user?.id} clock={clock.now} />}
    </>}
  </div>;
}
