"use client";

import { useState } from "react";
import { AvailabilityTimeline } from "./AvailabilityTimeline";
import { minutes } from "@/lib/publishedTimetable";
import type { Resource, Submit } from "./FacultyRequests";

export type FreeSlot = { start: string; end: string };
export type Availability = Resource & { free_slots?: FreeSlot[] };

export function ResourceAvailability({ date, from, to, setFrom, setTo, current, resources, available, dateOpen, canReserve, busy, submit }: {
  date: string; from: string; to: string; setFrom: (time: string) => void; setTo: (time: string) => void;
  current: boolean; resources: Resource[]; available: Availability[]; dateOpen: boolean; canReserve: boolean; busy: boolean; submit: Submit;
}) {
  const [mode, setMode] = useState<"matrix" | "list">("matrix");
  const [type, setType] = useState("");
  const [query, setQuery] = useState("");
  const [selection, setSelection] = useState<{ id: string; start: string; end: string } | null>(null);
  const [reason, setReason] = useState("");
  const types = [...new Set(resources.map(resource => resource.type).filter(Boolean))].sort();
  const slotsById = new Map(available.map(resource => [resource.id, resource.free_slots ?? [{ start: from, end: to }]]));
  const rows = resources.filter(resource => (!type || resource.type === type) &&
    [resource.id, resource.name, resource.parent].some(value => value?.toLowerCase().includes(query.trim().toLowerCase())))
    .map(resource => ({ ...resource, free_slots: slotsById.get(resource.id) || [] }));
  const matches = rows.filter(resource => resource.free_slots.length > 0);
  const valid = !!from && !!to && from >= "08:00" && to <= "17:00" && to > from;
  const chosen = selection && matches.some(resource => resource.id === selection.id) ? selection : null;
  const fits = chosen && matches.find(resource => resource.id === chosen.id)
    ?.free_slots?.some(slot => slot.start <= chosen.start && slot.end >= chosen.end)
    && minutes(chosen.end) - minutes(chosen.start) > 0 && minutes(chosen.end) - minutes(chosen.start) <= 180;

  function selectSlot(id: string, slot: FreeSlot) {
    const capped = Math.min(minutes(slot.end), minutes(slot.start) + 180);
    const end = `${String(Math.floor(capped / 60)).padStart(2, "0")}:${String(capped % 60).padStart(2, "0")}`;
    setSelection({ id, start: slot.start, end });
  }

  return <section className="rd-panel"><h2>Find free resources</h2><p>{date} · Campus time (IST)</p>
    <div className="rd-actions">
      <label>From<input type="time" min="08:00" max="17:00" value={from} onChange={e => setFrom(e.target.value)} /></label>
      <label>To<input type="time" min="08:00" max="17:00" value={to} onChange={e => setTo(e.target.value)} /></label>
      <label>Resource type<select value={type} onChange={e => setType(e.target.value)}>
        <option value="">All accessible types</option>
        {types.map(value => <option key={value} value={value!}>{value}</option>)}
      </select></label>
      <label>Resource name or ID<input type="search" value={query} onChange={e => setQuery(e.target.value)} /></label>
    </div>
    <div className="rd-actions availability-mode" aria-label="Availability view">
      <button type="button" aria-pressed={mode === "matrix"} onClick={() => setMode("matrix")}>Matrix</button>
      <button type="button" aria-pressed={mode === "list"} onClick={() => setMode("list")}>List</button>
    </div>
    {!valid ? <p>Choose a valid search window between 08:00 and 17:00.</p> :
      !current ? <p role="status">Checking availability…</p> :
      !dateOpen ? <p>No teaching schedule for this date. Set the dashboard clock to a teaching day within the published term.</p> :
      !rows.length ? <p>No resources match these filters.</p> :
      mode === "matrix" ? <AvailabilityTimeline rows={rows} from={from} to={to} reserve={canReserve ? selectSlot : undefined} /> :
      !matches.length ? <p>No free slots match this search window.</p> :
      <div className="rd-room-list">{matches.map(resource => <div key={resource.id}>
        <strong>{resource.name || resource.id}</strong>
        <small>{resource.id !== resource.name && resource.name ? resource.id + " · " : ""}{resource.type || "Type unverified"} · {resource.capacity ? `Capacity ${resource.capacity}` : "Capacity unknown"}</small>
        {resource.parent && <small>Lab {resource.parent}</small>}
        {(resource.free_slots || [{ start: from, end: to }]).map(slot => <div key={slot.start}>
          {slot.start}–{slot.end}
          {canReserve && resource.type === "workstation" && <button type="button" onClick={() => selectSlot(resource.id, slot)}>Select slot</button>}
        </div>)}
      </div>)}
      </div>}
    {canReserve && current && valid && chosen && <form onSubmit={event => {
      event.preventDefault();
      if (!fits) return;
      void submit("request", { kind: "workstation", date, room_id: chosen.id, start: chosen.start, end: chosen.end, reason: reason.trim() })
        .then(ok => { if (ok) { setSelection(null); setReason(""); } });
    }}>
      <h3>Reserve {chosen.id}</h3>
      <p>Choose up to three hours. Your request goes to HOD for approval.</p>
      <div className="rd-actions">
        <label>Start<input required type="time" value={chosen.start} onChange={e => setSelection({ ...chosen, start: e.target.value })} /></label>
        <label>End<input required type="time" value={chosen.end} onChange={e => setSelection({ ...chosen, end: e.target.value })} /></label>
        <label>Reason<input required minLength={3} maxLength={1000} value={reason} onChange={e => setReason(e.target.value)} /></label>
        <button disabled={busy || reason.trim().length < 3 || !fits}>Request workstation</button>
      </div>
      {!fits && <p>Use a free interval of up to three hours.</p>}
    </form>}
  </section>;
}
