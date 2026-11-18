"use client";

import { useState } from "react";
import { CLASS_GROUPS, DAYS, type PublishedSession, type Submission } from "@/lib/publishedTimetable";

type Submit = (payload: Record<string, unknown>, message: string) => Promise<void>;

export function ScheduleImports({ draft, approved, busy, submit }: {
  draft: Submission | null;
  approved: Submission | null;
  busy: boolean;
  submit: Submit;
}) {
  const [resources, setResources] = useState<File | null>(null);
  const [timetable, setTimetable] = useState<File | null>(null);
  const [group, setGroup] = useState("A");
  const [editing, setEditing] = useState<{ version: string; row: PublishedSession } | null>(null);
  const source = draft || approved;
  const rows = (source?.rows || []).filter(row => (row.batch || row.section) === group);
  const active = editing?.version === source?.id ? editing?.row : undefined;
  const set = (key: keyof PublishedSession, value: string) => {
    if (editing && active) setEditing({ ...editing, row: { ...active, [key]: value } });
  };

  async function upload(file: File, action: string, message: string) {
    await submit({ action, filename: file.name, csv: file.size > 2_000_000 ? null : await file.text() }, message);
  }

  return <section className="rd-panel" id="imports">
    <h2>Import resources and timetable</h2>
    <div className="rd-actions">
      <label>Resource CSV<input type="file" accept=".csv,text/csv" onChange={event => setResources(event.target.files?.[0] ?? null)} /></label>
      <button disabled={busy || !resources} onClick={() => resources && upload(resources, "import-resources", "Resources imported.")}>Import resources</button>
    </div>
    <div className="rd-actions">
      <label>Timetable CSV<input type="file" accept=".csv,text/csv" onChange={event => setTimetable(event.target.files?.[0] ?? null)} /></label>
      <button disabled={busy || !timetable} onClick={() => timetable && upload(timetable, "upload", "Timetable uploaded for HOD review.")}>Upload timetable</button>
    </div>
    <h3>Edit imported classes</h3>
    <p>Edits are saved to a draft for HOD approval.</p>
    <div className="rd-actions">
      <label>Class group<select value={group} onChange={event => { setGroup(event.target.value); setEditing(null); }}>
        {CLASS_GROUPS.map(item => <option key={item}>{item}</option>)}
      </select></label>
      <label>Session<select value={active?.entry_id || ""} disabled={!rows.length} onChange={event => {
        const row = rows.find(item => item.entry_id === event.target.value);
        setEditing(row && source ? { version: source.id, row } : null);
      }}>
        <option value="">Select a session</option>
        {rows.map(row => <option key={row.entry_id} value={row.entry_id}>
          S{row.semester} · {row.day} {row.start_time} · {row.course_name}
        </option>)}
      </select></label>
    </div>
    {!rows.length && <p>No imported sessions for {group}.</p>}
    {active && editing && <form onSubmit={event => {
      event.preventDefault();
      void submit({ action: "edit-session", sourceId: editing.version, row: active }, "Class edit saved for HOD review.");
    }}>
      <div className="rd-actions">
        <label>Day<select value={active.day} onChange={event => set("day", event.target.value)}>
          {DAYS.map(day => <option key={day}>{day}</option>)}
        </select></label>
        <label>Start<input type="time" required value={active.start_time} onChange={event => set("start_time", event.target.value)} /></label>
        <label>End<input type="time" required value={active.end_time} onChange={event => set("end_time", event.target.value)} /></label>
        <label>Room ID<input required value={active.room_id} onChange={event => set("room_id", event.target.value)} /></label>
        <label>Faculty IDs<input required value={active.faculty_id} onChange={event => set("faculty_id", event.target.value)} /></label>
        <label>Faculty names<input required value={active.faculty_name} onChange={event => set("faculty_name", event.target.value)} /></label>
        <button disabled={busy}>Save class edit</button>
      </div>
    </form>}
  </section>;
}
