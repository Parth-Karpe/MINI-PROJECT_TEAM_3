"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { DAYS, DEMO_USERS, minutes, type PublicationState, type PublishedSession, type Role } from "@/lib/publishedTimetable";

type Occupancy = Pick<PublishedSession, "day" | "start_time" | "end_time" | "room_id" | "session_type">;
type ViewState = PublicationState & { occupancy?: Occupancy[] };
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
function Timetable({ rows }: { rows: PublishedSession[] }) {
  if (!rows.length) return <p className="rd-empty">No matching sessions. Admin can check the faculty or student mapping.</p>;
  return <div className="rd-table-wrap"><table><thead><tr><th>Day</th><th>Time</th><th>Course</th><th>Section / batch</th><th>Faculty</th><th>Room</th></tr></thead><tbody>
    {[...rows].sort((a,b) => DAYS.indexOf(a.day) - DAYS.indexOf(b.day) || minutes(a.start_time) - minutes(b.start_time)).map(r => <tr key={r.entry_id}><td>{r.day}</td><td className="rd-nowrap">{r.start_time}–{r.end_time}</td><td><strong>{r.course_name}</strong><small>{r.course_code} · {r.session_type}</small></td><td>{r.section}{r.batch ? ` / ${r.batch}` : " / whole section"}</td><td>{r.faculty_name}</td><td>{r.room_id}</td></tr>)}
  </tbody></table></div>;
}
export function RoleDashboard({ role }: { role: Role }) {
  const [state, setState] = useState<ViewState | null>(null), [error, setError] = useState("");
  const [notice, setNotice] = useState(""), [busy, setBusy] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [section, setSection] = useState("A"), [batch, setBatch] = useState("A1"), [facultyId, setFacultyId] = useState("AK");
  const [day, setDay] = useState("Mon"), [start, setStart] = useState("09:00"), [end, setEnd] = useState("10:00");
  const refresh = useCallback(async () => {
    try {
      const response = await fetch(`/api/publication?role=${role}`, { cache: "no-store" }); const data = await response.json();
      if (!response.ok) throw new Error(data.error); setState(data); setError("");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not load dashboard."); }
  }, [role]);
  useEffect(() => { setState(null); void refresh(); const timer = setInterval(refresh, 10000); return () => clearInterval(timer); }, [refresh]);
  useEffect(() => { if (state) { setSection(state.studentSection); setBatch(state.studentBatch); setFacultyId(state.facultyId); } }, [state?.studentSection, state?.studentBatch, state?.facultyId]); // eslint-disable-line react-hooks/exhaustive-deps
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
  const roomType = (id: string) => occupancy.some(r => r.room_id === id && r.session_type === "lab") ? "lab" : "classroom";
  const freeRooms = rooms.filter(id => (role !== "student" || roomType(id) === "classroom") && !occupancy.some(r => r.room_id === id && r.day === day && minutes(r.start_time) < minutes(end) && minutes(start) < minutes(r.end_time)));
  return <div className="rd-dashboard">
    <header className="rd-header"><div><p className="rd-eyebrow">CSE (AI) · SEMESTER V · 2026–27</p><h1>{role.charAt(0).toUpperCase() + role.slice(1)} Dashboard</h1><p>{DEMO_USERS[role].name} · {role === "faculty" ? state?.facultyId || "AK" : DEMO_USERS[role].id}{role === "student" && state ? ` · Section ${state.studentSection} / ${state.studentBatch}` : ""}</p></div><button onClick={refresh}>Refresh</button></header>
    <p className="rd-demo">Demo accounts · Switch roles in the sidebar to test the workflow. Parth’s section/batch mapping is provisional and editable in Admin.</p>
    {error && <p role="alert" className="rd-error">{error}</p>}{notice && <p role="status" className="rd-success">{notice}</p>}
    {!state ? <p>Loading dashboard…</p> : <>
      <div className="rd-stats"><div><small>Publication</small><strong>{state.approved ? "Approved" : "Not published"}</strong></div><div><small>{reviewer ? "Published sessions" : "My sessions"}</small><strong>{rows.length}</strong></div><div><small>{reviewer ? "Known rooms" : "Weekly teaching / study hours"}</small><strong>{reviewer ? rooms.length : weeklyHours}</strong></div><div><small>{reviewer ? "Awaiting HOD review" : "Semester"}</small><strong>{reviewer ? state.draft ? "Yes" : "No" : "5"}</strong></div></div>
      {admin && <section className="rd-panel"><h2>Upload the existing timetable</h2><p>Upload CSV → review checks → HOD approves → publish to faculty and students. A new draft does not replace the published timetable.</p><div className="rd-actions"><input aria-label="Timetable CSV" type="file" accept=".csv,text/csv" onChange={e => setFile(e.target.files?.[0] || null)} /><button disabled={busy || !file} onClick={async () => { if (!file) return; if (file.size > 2_000_000) { setError("Upload a CSV smaller than 2 MB."); return; } await act({ action: "upload", filename: file.name, csv: await file.text() }, "Draft uploaded. Open HOD Dashboard to review."); }}>Upload for HOD review</button><button onClick={downloadSample}>Download demo CSV</button></div><p className="rd-note">Demo CSV uses illustrative sessions, not a transcription of the college PDF. Use separate rows for parallel batches; faculty IDs can be separated by semicolons. Zero student counts mean unknown.</p></section>}
      {admin && <section className="rd-panel"><h2>Demo account mappings</h2><div className="rd-actions"><label>Amit K · faculty ID<input value={facultyId} onChange={e => setFacultyId(e.target.value)} /></label><label>Parth Karpe · section<select value={section} onChange={e => { setSection(e.target.value); setBatch(`${e.target.value}1`); }}><option>A</option><option>B</option></select></label><label>Lab batch<select value={batch} onChange={e => setBatch(e.target.value)}><option>{section}1</option><option>{section}2</option></select></label><button disabled={busy} onClick={() => act({ action: "mapping", section, batch, facultyId }, "Demo mappings saved.")}>Save mappings</button></div></section>}
      {reviewer && <section className="rd-panel"><h2>{hod ? "Review and approve" : "Draft status"}</h2>{state.draft ? <><p><strong>{state.draft.filename}</strong> · {state.draft.rows.length} sessions · Uploaded {new Date(state.draft.uploadedAt).toLocaleString()}</p><p className={state.draft.findings.length ? "rd-error" : "rd-success"}>{state.draft.findings.length ? `${state.draft.findings.length} blocking conflict(s)` : "Faculty, room and section/batch overlap checks passed."}</p>{state.draft.findings.length > 0 && <ul>{state.draft.findings.map((f,i) => <li key={i}>{f}</li>)}</ul>}<p className="rd-note">L:T:P and capacity compliance are not certified: official course requirements and room capacities have not been supplied. This initial approval publishes the static timetable after overlap checks.</p><Timetable rows={state.draft.rows} />{hod && <button className="rd-primary" disabled={busy || !!state.draft.findings.length} onClick={() => act({ action: "approve", draftId: state.draft!.id }, "Timetable approved and published to faculty and students.")}>Approve and publish timetable</button>}</> : <p className="rd-empty">No draft awaiting review. Admin can upload the existing timetable.</p>}</section>}
      {hod && <section className="rd-panel"><h2>Scheduled resource utilization</h2><p>Published timetable only · Mon–Sat, 08:00–17:00 · 54 available hours per room/week. Measures scheduled occupancy, not actual attendance.</p>{!rows.length ? <p className="rd-empty">Statistics appear after approval.</p> : rooms.map(room => { const intervals = rows.filter(r => r.room_id === room); const used = DAYS.reduce((total,d) => { const spans = intervals.filter(r => r.day === d).map(r => [minutes(r.start_time), minutes(r.end_time)]).sort((a,b) => a[0]-b[0]); let end = 0, sum = 0; for (const [s,e] of spans) { sum += Math.max(0, e-Math.max(s,end)); end=Math.max(end,e); } return total+sum/60; },0); return <div className="rd-usage" key={room}><div><strong>{room}</strong><span>{used.toFixed(1)} / 54 hrs · {(used/54*100).toFixed(1)}%</span></div><progress max={54} value={used} /></div>; })}</section>}
      <section className="rd-panel"><h2>{reviewer ? "Published timetable" : "My approved timetable"}</h2>{state.approved ? <><p className="rd-note">Approved {new Date(state.approved.approvedAt!).toLocaleString()}</p><Timetable rows={rows} /></> : <p className="rd-empty">Waiting for HOD approval. Draft sessions are not published here.</p>}</section>
      {!reviewer && <section className="rd-panel"><h2>Available {role === "student" ? "classrooms" : "classrooms and labs"}</h2><p>Checks rooms appearing in the approved timetable. Other departments and later booking requests are outside this view.</p><div className="rd-actions"><label>Day<select value={day} onChange={e => setDay(e.target.value)}>{DAYS.map(d => <option key={d}>{d}</option>)}</select></label><label>From<input type="time" value={start} onChange={e => setStart(e.target.value)} /></label><label>To<input type="time" value={end} onChange={e => setEnd(e.target.value)} /></label></div>{!state.approved ? <p className="rd-empty">Availability appears after approval.</p> : !availabilityValid ? <p role="alert">Choose a valid interval within 08:00–17:00.</p> : freeRooms.length ? <div className="rd-room-list">{freeRooms.map(id => <div key={id}><strong>{id}</strong><small>{roomType(id)} · free {start}–{end}</small></div>)}</div> : <p className="rd-empty">No known rooms are free during this interval.</p>}<p className="rd-note">Room type is inferred from scheduled lab sessions. No capacity or booking guarantee is made.</p></section>}
      {admin && <section className="rd-panel"><h2>Administration tools</h2><div className="rd-actions">{[["/resources","Resources"],["/timetable","Legacy timetable"],["/timetable/maker","Timetable Studio"],["/schedule","Schedule"],["/bookings","Bookings & queues"],["/admin","Overrides & audit"]].map(([href,label]) => <Link key={href} href={href}>{label} →</Link>)}</div><p className="rd-note">These existing tools use the original engine. The new static timetable publication is a separate local workflow; dynamic bookings are deferred.</p></section>}
    </>}
  </div>;
}
