"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CampusWorkflows } from "./CampusWorkflows";
import type { Identity } from "@/lib/localAuth";
import { StaffImport } from "./StaffImport";
import { FairnessPreview } from "./FairnessPreview";
import { WeeklyTimetable } from "./WeeklyTimetable";
import { DAYS, DEMO_USERS, minutes, type PublicationState, type PublishedSession, type Role, type CsvResource } from "@/lib/publishedTimetable";

type Occupancy = Pick<PublishedSession, "day" | "start_time" | "end_time" | "room_id" | "session_type">;
type ViewState = PublicationState & { resources?: CsvResource[]; draftResources?: CsvResource[]; occupancy?: Occupancy[] };
const SAMPLE = `entry_id,day,start_time,end_time,branch,semester,section,batch,course_code,course_name,session_type,faculty_id,faculty_name,room_id,expected_students
S01,Mon,09:00,10:00,CSE-AI,5,A,,DEMO-AISD,AI Assisted Software Development,theory,AK,Amit K,LHC306,0
S02,Tue,10:15,11:15,CSE-AI,5,A,,DEMO-AISD,AI Assisted Software Development,tutorial,AK,Amit K,LHC306,0
S03,Wed,13:30,15:30,CSE-AI,5,A,A1,DEMO-AISD,AI Assisted Software Development,lab,AK,Amit K,LAB6,0
S04,Thu,13:30,15:30,CSE-AI,5,A,A2,DEMO-AISD,AI Assisted Software Development,lab,AK,Amit K,LAB6,0
S05,Fri,09:00,10:00,CSE-AI,5,B,,DEMO-AISD,AI Assisted Software Development,theory,AK,Amit K,LHC307,0
S06,Mon,10:15,11:15,CSE-AI,5,A,,DEMO-DL,Deep Learning,theory,SV,Sneha V,LHC306,0
S07,Tue,13:30,15:30,CSE-AI,5,A,A1,DEMO-DL,Deep Learning,lab,SV,Sneha V,LAB6,0
S08,Tue,13:30,15:30,CSE-AI,5,A,A2,DEMO-CNS,Cryptography and Network Security,lab,PS,Pooja S,LHC201,0
`;
function downloadSample() {
  const url = URL.createObjectURL(new Blob([SAMPLE], { type: "text/csv" }));
  const a = document.createElement("a"); a.href = url; a.download = "csai5_dashboard_demo.csv"; a.click(); URL.revokeObjectURL(url);
}
const Timetable = WeeklyTimetable;
export function RoleDashboard({ role }: { role: Role }) {
  const [user,setUser] = useState<Identity|null>(null);
  useEffect(()=>{fetch("/api/session").then(r=>r.json()).then(d=>setUser(d.user));},[]);
  const [termStart,setTermStart]=useState("2026-09-07"),[termEnd,setTermEnd]=useState("2026-12-29");
  const [state, setState] = useState<ViewState | null>(null), [error, setError] = useState("");
  const [notice, setNotice] = useState(""), [busy, setBusy] = useState(false);
  const [file, setFile] = useState<File | null>(null);
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
  const admin = role === "admin", hod = role === "hod", reviewer = admin || hod;
  const rows = state?.approved?.rows || [];
  const occupancy: Occupancy[] = state?.occupancy || rows;
  const rooms = [...new Set(occupancy.map(r => r.room_id))].sort();
  const weeklyHours = rows.reduce((n,r) => n + (minutes(r.end_time) - minutes(r.start_time)) / 60, 0);
  const availabilityValid = !!start && !!end && minutes(start) >= 480 && minutes(end) <= 1020 && minutes(end) > minutes(start);
  const roomType = (id: string) => state?.resources?.find(r => r.id === id)?.type || "unverified";
  const freeRooms = rooms.filter(id => (role !== "student" || roomType(id) === "classroom") && !occupancy.some(r => r.room_id === id && r.day === day && minutes(r.start_time) < minutes(end) && minutes(start) < minutes(r.end_time)));
  return <div className="rd-dashboard">
    <header className="rd-header"><div><p className="rd-eyebrow">CSE (AI) · SEMESTERS I / III / V / VII · 2026–27</p><h1>{role==='hod'?'HOD':role.charAt(0).toUpperCase() + role.slice(1)} Dashboard</h1><p>{user?.name || DEMO_USERS[role].name} · {role === "faculty" ? user?.facultyId || "AK" : user?.id || DEMO_USERS[role].id}{role === "student" && state ? ` · Semester ${state.studentSemester || 5} · Section ${state.studentSection} / ${state.studentBatch}` : ""}</p></div><button onClick={refresh}>Refresh</button></header>
    <p className="rd-demo">Authenticated local review mode. Academic changes require HOD approval. Supabase login is not connected yet.</p>
    {error && <p role="alert" className="rd-error">{error}</p>}{notice && <p role="status" className="rd-success">{notice}</p>}
    {!state ? <p>Loading dashboard…</p> : <>
      <div className="rd-stats"><div><small>Publication</small><strong>{state.approved ? "Approved" : "Not published"}</strong></div><div><small>{reviewer ? "Published sessions" : "My sessions"}</small><strong>{rows.length}</strong></div><div><small>{reviewer ? "Known rooms" : "Weekly teaching / study hours"}</small><strong>{reviewer ? rooms.length : weeklyHours}</strong></div><div><small>{reviewer ? "Awaiting HOD review" : "Semester"}</small><strong>{reviewer ? state.draft ? "Yes" : "No" : role === "student" ? String(state.studentSemester || 5) : "1 / 3 / 5 / 7"}</strong></div></div>
      {admin && <section className="rd-panel"><h2>Upload the existing timetable</h2><p>Upload CSV → review checks → HOD approves → publish to faculty and students. A new draft does not replace the published timetable.</p><div className="rd-actions"><input aria-label="Timetable CSV" type="file" accept=".csv,text/csv" onChange={e => setFile(e.target.files?.[0] || null)} /><button disabled={busy || !file} onClick={async () => { if (!file) return; if (file.size > 2_000_000) { setError("Upload a CSV smaller than 2 MB."); return; } await act({ action: "upload", filename: file.name, csv: await file.text() }, "Draft uploaded. Open HOD Dashboard to review."); }}>Upload for HOD review</button><button onClick={downloadSample}>Download demo CSV</button></div><p className="rd-note">Demo CSV uses illustrative sessions, not a transcription of the college PDF. Use separate rows for parallel batches; faculty IDs can be separated by semicolons. Zero student counts mean unknown.</p></section>}
      {admin && <StaffImport records={state.staff || []} onSaved={refresh} />}
      {admin && <section className="rd-panel"><h2>Demo account mappings</h2><div className="rd-actions"><label>Amit K · faculty ID<input value={facultyId} onChange={e => setFacultyId(e.target.value)} /></label><label>Student semester<select value={semester} onChange={e => setSemester(Number(e.target.value))}>{[1,3,5,7].map(n => <option key={n}>{n}</option>)}</select></label><label>Parth Karpe · section<select value={section} onChange={e => { setSection(e.target.value); setBatch(`${e.target.value}1`); }}><option>A</option><option>B</option></select></label><label>Lab batch<select value={batch} onChange={e => setBatch(e.target.value)}><option>{section}1</option><option>{section}2</option></select></label><button disabled={busy} onClick={() => act({ action: "mapping", semester, section, batch, facultyId }, "Demo mappings saved.")}>Save mappings</button></div></section>}
      {reviewer && <section className="rd-panel"><h2>{hod ? "Review and approve" : "Draft status"}</h2>{state.draft ? <><p><strong>{state.draft.filename}</strong> · {state.draft.rows.length} sessions · Uploaded {new Date(state.draft.uploadedAt).toLocaleString()}</p><p className={state.draft.findings.length ? "rd-error" : "rd-success"}>{state.draft.findings.length ? `${state.draft.findings.length} blocking conflict(s)` : "Faculty, room and section/batch overlap checks passed."}</p>{state.draft.findings.length > 0 && <ul>{state.draft.findings.map((f,i) => <li key={i}>{f}</li>)}</ul>}<p className="rd-note">L:T:P is checked against imported contact-hour requirements; missing requirements remain unverified. Capacity is checked where room_capacity is supplied in the CSV; missing capacities remain unverified. Publication runs final validation in the Python backend.</p><Timetable rows={state.draft.rows} />{hod && <div className="rd-actions"><label>Term starts<input type="date" onInput={e=>setTermStart(e.currentTarget.value)} value={termStart} onChange={e=>setTermStart(e.target.value)}/></label><label>Term ends<input type="date" onInput={e=>setTermEnd(e.currentTarget.value)} value={termEnd} onChange={e=>setTermEnd(e.target.value)}/></label></div>}{hod && <button className="rd-primary" disabled={busy || !!state.draft.findings.length} onClick={() => act({ action: "approve", draftId: state.draft!.id, termStart, termEnd }, "Timetable approved and published to faculty and students.")}>Approve and publish timetable</button>}</> : <p className="rd-empty">No draft awaiting review. Admin can upload the existing timetable.</p>}</section>}
      {hod && <section className="rd-panel"><h2>Scheduled resource utilization</h2><p>Published timetable only · Mon–Sat, 08:00–17:00 · 54 available hours per room/week. Measures scheduled occupancy, not actual attendance.</p>{!rows.length ? <p className="rd-empty">Statistics appear after approval.</p> : rooms.map(room => { const intervals = rows.filter(r => r.room_id === room); const used = DAYS.reduce((total,d) => { const spans = intervals.filter(r => r.day === d).map(r => [minutes(r.start_time), minutes(r.end_time)]).sort((a,b) => a[0]-b[0]); let end = 0, sum = 0; for (const [s,e] of spans) { sum += Math.max(0, e-Math.max(s,end)); end=Math.max(end,e); } return total+sum/60; },0); return <div className="rd-usage" key={room}><div><strong>{room}</strong><span>{used.toFixed(1)} / 54 hrs · {(used/54*100).toFixed(1)}%</span></div><progress max={54} value={used} /></div>; })}</section>}
      {hod && <FairnessPreview rooms={rooms} />}
      <section className="rd-panel"><h2>{reviewer ? "Published timetable" : "My approved timetable"}</h2>{state.approved ? <><p className="rd-note">Approved {new Date(state.approved.approvedAt!).toLocaleString()}</p><Timetable rows={rows} /></> : <p className="rd-empty">Waiting for HOD approval. Draft sessions are not published here.</p>}</section>
      {admin && <section className="rd-panel"><h2>Resources from uploaded timetable</h2><p>Optional columns: room_name, room_type, room_capacity, building. Resource IDs are extracted across every imported semester.</p><div className="rd-table-wrap"><table><thead><tr><th>ID</th><th>Type</th><th>Capacity</th><th>Building</th></tr></thead><tbody>{(state.draftResources?.length ? state.draftResources : state.resources || []).map(r => <tr key={r.id}><td>{r.id}</td><td>{r.type || "Unverified"}</td><td>{r.capacity || "Unknown"}</td><td>{r.building || "Unknown"}</td></tr>)}</tbody></table></div></section>}
      <CampusWorkflows role={role} facultyId={user?.facultyId} />
      {admin && <section className="rd-panel"><h2>Administration tools</h2><div className="rd-actions">{[["/resources","Resources"],["/timetable","Legacy timetable"],["/timetable/maker","Timetable Studio"],["/schedule","Schedule"],["/bookings","Bookings & queues"],["/admin","Overrides & audit"]].map(([href,label]) => <Link key={href} href={href}>{label} →</Link>)}</div><p className="rd-note">Legacy tools use a separate allocator and are retained for reference. The dated workflow above uses the persistent Python campus service; use it for review demonstrations.</p></section>}
    </>}
  </div>;
}
