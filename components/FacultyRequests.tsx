"use client";

import { useState } from "react";
import { facultyIds, minutes, type PublishedSession } from "@/lib/publishedTimetable";

export type Resource = { id: string; name?: string; type: string | null; capacity: number | null; parent?: string };
export type Submit = (action: string, payload: Record<string, unknown>) => Promise<boolean>;

export const REQUEST_LABELS: Record<string, string> = {
  reschedule: "Reschedule a class", extra_class: "Request an extra class",
  swap: "Mutual swap", negotiate: "Negotiate multiple moves", absence: "Report an absence",
  cover: "Offer subject coverage", booking: "Request a room or hall", workstation: "Reserve a workstation",
};

const instructions: Record<string, string> = {
  reschedule: "Move an existing class and keep its original duration.",
  extra_class: "Add a session for one of your teaching groups. The original class stays scheduled.",
  swap: "Exchange two equal-length sessions. Affected faculty must consent before HOD approval.",
  negotiate: "Give each displaced session a replacement. Partners keep their original duration. You may explicitly extend your own session.",
  absence: "Choose one session or report absence for all your classes on the selected date.",
  cover: "Choose an HOD-approved absence for a subject you already teach.",
  booking: "Choose one of your teaching groups and request a room for an event.",
};

const weekday = (date: string) => new Date(date + "T12:00:00").toLocaleDateString("en-US", { weekday: "short" });
const occurs = (row: PublishedSession, date: string) => row._one_off_date ? row._one_off_date === date : row.day === weekday(date);
const description = (row: PublishedSession) => `${row.course_name} · S${row.semester} ${row.batch || row.section} · ${row.day} ${row.start_time}–${row.end_time} · ${row.faculty_name || row.faculty_id}`;
const duration = (row: PublishedSession) => minutes(row.end_time) - minutes(row.start_time);
const validInterval = (start: string, end: string) => !!start && !!end && start >= "08:00" && end <= "17:00" && end > start;

function Sessions({ label, rows, value, onChange }: { label: string; rows: PublishedSession[]; value: string; onChange: (value: string) => void }) {
  return <label>{label}<select required value={value} onChange={event => onChange(event.target.value)}>
    <option value="">Select a session</option>
    {rows.map(row => <option key={row.entry_id} value={row.entry_id}>{description(row)}</option>)}
  </select></label>;
}

function Rooms({ rooms, value, onChange, optional = false }: { rooms: Resource[]; value: string; onChange: (value: string) => void; optional?: boolean }) {
  return <label>Resource<select required={!optional} value={value} onChange={event => onChange(event.target.value)}>
    <option value="">{optional ? "Keep my original room" : "Select a resource"}</option>
    {rooms.map(room => <option key={room.id} value={room.id}>{room.id}{room.type && ` · ${room.type}`}</option>)}
  </select></label>;
}

type Move = { key: number; source_id: string; date: string; target_date: string; start: string; end: string; room_id: string; extend: boolean };
const newMove = (key: number, date: string, row?: PublishedSession): Move => ({
  key, date, target_date: date, source_id: row?.entry_id || "", start: row?.start_time || "",
  end: row?.end_time || "", room_id: row?.room_id || "", extend: false,
});

export function FacultyRequests({ date, facultyId, catalog, teaching, effective, coverageIds, resources, busy, submit }: {
  date: string; facultyId: string; catalog: PublishedSession[]; teaching: PublishedSession[]; effective: PublishedSession[]; coverageIds: string[];
  resources: Resource[]; busy: boolean; submit: Submit;
}) {
  const [kind, setKind] = useState("reschedule");
  const [sourceId, setSourceId] = useState("");
  const [partnerId, setPartnerId] = useState("");
  const [partnerDate, setPartnerDate] = useState(date);
  const [targetDate, setTargetDate] = useState(date);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [room, setRoom] = useState("");
  const [participants, setParticipants] = useState("");
  const [reason, setReason] = useState("");
  const [allDay, setAllDay] = useState(false);
  const [moves, setMoves] = useState<Move[]>([]);
  const [validation, setValidation] = useState("");
  const rooms = resources.filter(resource => resource.type !== "workstation");
  const timed = ["reschedule", "extra_class", "booking"].includes(kind);
  const teachingToday = effective.filter(row => !row.entry_id.startsWith("WORK-") && facultyIds(row).includes(facultyId) && occurs(row, date));
  const choices = kind === "cover" ? catalog.filter(row => coverageIds.includes(row.entry_id))
    : kind === "booking" ? teaching : teachingToday;
  const source = choices.find(row => row.entry_id === sourceId);
  const anchor = kind === "absence" && allDay ? teachingToday[0] : source;
  const partnerChoices = catalog.filter(row => row.entry_id !== sourceId && occurs(row, partnerDate) && source && duration(row) === duration(source));
  const choose = (id: string) => {
    const row = choices.find(item => item.entry_id === id);
    setSourceId(id);
    setPartnerId("");
    setRoom(kind === "swap" ? "" : row?.room_id || "");
    setStart(row?.start_time || "");
    setEnd(row?.end_time || "");
    setMoves(row ? [newMove(0, date, row), newMove(1, date)] : []);
    setValidation("");
  };
  const editMove = (key: number, values: Partial<Move>) => setMoves(current =>
    current.map(move => move.key === key ? { ...move, ...values } : move));

  async function send() {
    setValidation("");
    if (!anchor) return setValidation("Choose a teaching session for this request.");
    if (timed && !validInterval(start, end)) return setValidation("Choose a valid interval from 08:00 to 17:00.");
    if (kind === "reschedule" && minutes(end) - minutes(start) !== duration(anchor))
      return setValidation("The new time must preserve the original duration.");
    if (kind === "swap" && !partnerChoices.some(row => row.entry_id === partnerId))
      return setValidation("Choose an equal-length partner session on the partner date.");
    if (kind === "negotiate" && moves.some(move => {
      const row = [...catalog, ...teachingToday].find(item => item.entry_id === move.source_id);
      if (!row || !occurs(row, move.date) || !validInterval(move.start, move.end)) return true;
      const difference = minutes(move.end) - minutes(move.start) - duration(row);
      return difference !== 0 && !(difference > 0 && move.extend && facultyIds(row).includes(facultyId));
    })) return setValidation("Check each original occurrence, replacement time, and duration.");
    if (await submit("request", {
      kind, date, source_id: anchor.entry_id, reason: reason.trim(), target_date: targetDate,
      start, end, room_id: room, partner_id: partnerId, partner_date: partnerDate,
      expected_students: kind === "booking" && participants ? Number(participants) : undefined,
      all_day: kind === "absence" && allDay,
      moves: kind === "negotiate" ? moves.map(({ key, ...move }) => move) : undefined,
    })) setReason("");
  }

  return <section className="rd-panel"><h2>Faculty requests</h2>
    <form onSubmit={event => { event.preventDefault(); void send(); }}>
      <div className="rd-actions"><label>Request type<select value={kind} onChange={event => {
        setKind(event.target.value); choose(""); setAllDay(false); setTargetDate(date); setPartnerDate(date);
      }}>{Object.entries(REQUEST_LABELS).filter(([key]) => key !== "workstation").map(([key, label]) =>
        <option key={key} value={key}>{label}</option>)}</select></label></div>
      <p>{instructions[kind]}</p>
      <div className="rd-actions">
        {kind === "absence" && <label><span><input type="checkbox" checked={allDay} onChange={e => setAllDay(e.target.checked)} /> All classes on {date}</span></label>}
        {!(kind === "absence" && allDay) && <Sessions label={kind === "booking" ? "Teaching group" : "Original session"} rows={choices} value={sourceId} onChange={choose} />}
        {kind === "swap" && <><label>Partner date<input required type="date" value={partnerDate} onChange={event => { setPartnerDate(event.target.value); setPartnerId(""); }} /></label>
          <Sessions label="Partner session" rows={partnerChoices} value={partnerId} onChange={setPartnerId} />
          <Rooms rooms={rooms} value={room} onChange={setRoom} optional /></>}
        {timed && <>
          {kind !== "booking" && <label>Target date<input required type="date" value={targetDate} onChange={e => setTargetDate(e.target.value)} /></label>}
          <label>Start<input required type="time" value={start} onChange={e => setStart(e.target.value)} /></label>
          <label>End<input required type="time" value={end} onChange={e => setEnd(e.target.value)} /></label>
          <Rooms rooms={rooms} value={room} onChange={setRoom} />
        </>}
        {kind === "booking" && <label>Participants<input type="number" min={1} max={1000} value={participants} onChange={e => setParticipants(e.target.value)} /></label>}
      </div>
      {!choices.length && <p>{kind === "cover" ? "No eligible approved absences on this date." : "No eligible classes. Choose another date with the test clock."}</p>}
      {kind === "negotiate" && source && <>
        {moves.map((move, index) => {
          const row = [...catalog, ...teachingToday].find(entry => entry.entry_id === move.source_id);
          return <fieldset key={move.key}><legend>{index === 0 ? "Your original session" : `Displaced session ${index}`}</legend>
            <div className="rd-actions">
              {index > 0 && <>
                <label>Original date<input type="date" required value={move.date} onChange={e => editMove(move.key, { date: e.target.value, source_id: "", extend: false })} /></label>
                <Sessions label="Displaced session" rows={catalog.filter(entry => occurs(entry, move.date))} value={move.source_id} onChange={id =>
                  editMove(move.key, newMove(move.key, move.date, catalog.find(entry => entry.entry_id === id)))} />
              </>}
              <label>Replacement date<input type="date" required value={move.target_date} onChange={e => editMove(move.key, { target_date: e.target.value })} /></label>
              <label>Start<input type="time" required value={move.start} onChange={e => editMove(move.key, { start: e.target.value })} /></label>
              <label>End<input type="time" required value={move.end} onChange={e => editMove(move.key, { end: e.target.value })} /></label>
              <Rooms rooms={rooms} value={move.room_id} onChange={value => editMove(move.key, { room_id: value })} />
              {row && facultyIds(row).includes(facultyId) && <label><span><input type="checkbox" checked={move.extend} onChange={e => editMove(move.key, { extend: e.target.checked })} /> Allow a longer session</span></label>}
              {index > 0 && moves.length > 2 && <button type="button" onClick={() => setMoves(current => current.filter(item => item.key !== move.key))}>Remove move</button>}
            </div>
          </fieldset>;
        })}
        <button type="button" disabled={moves.length >= 10} onClick={() => setMoves(current => [...current, newMove(Math.max(...current.map(move => move.key)) + 1, date)])}>Add displaced session</button>
      </>}
      <div className="rd-actions"><label>Reason<input required minLength={3} maxLength={1000} value={reason} onChange={e => setReason(e.target.value)} /></label>
      <button disabled={busy || !anchor || reason.trim().length < 3}>Submit request</button></div>
      {validation && <p className="rd-error" role="alert">{validation}</p>}
    </form>
  </section>;
}
