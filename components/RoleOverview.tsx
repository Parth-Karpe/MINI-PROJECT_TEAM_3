"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { DAYS, minutes, type PublishedSession, type Role, type Submission } from "@/lib/publishedTimetable";
import { WeeklyTimetable, timetableStatus } from "./WeeklyTimetable";
import { REQUEST_LABELS } from "./FacultyRequests";
import { DeptStats } from "./stats/DeptStats";

/** The parts of the live /api/workflow view that the overview reads. Everything shown comes from here. */
type Request = { id: string; kind: string; date: string; status: string; reason: string; decision?: string; validation: string; owner: { id: string; name: string }; consents: Record<string, string> };
type Resource = { id: string; type?: string | null; parent?: string };
interface OverviewData {
  published: boolean; date: string; rows: PublishedSession[]; resources: Resource[];
  requests: Request[]; notifications: { id: string; message: string; at: string }[]; announcements: { id: string; message: string }[];
  utilization: Record<string, number>; draft: Submission | null; publication: (Submission & { term_start?: string; term_end?: string }) | null;
}

const OPEN = ["pending_hod", "pending_consent", "waitlisted"];
const STATUS_TEXT: Record<string, string> = {
  pending_hod: "Waiting for HOD", pending_consent: "Waiting for faculty consent", waitlisted: "Waitlisted",
  approved: "Approved", rejected: "Rejected", cancelled: "Cancelled", expired: "Expired",
};
const statusText = (s: string) => STATUS_TEXT[s] || s.replaceAll("_", " ");
const statusTone = (s: string) => s === "approved" ? "good" : s === "rejected" || s === "expired" ? "bad" : OPEN.includes(s) ? "wait" : "mute";
const kindText = (k: string) => REQUEST_LABELS[k] || k.replaceAll("_", " ");
const byStart = (a: PublishedSession, b: PublishedSession) => minutes(a.start_time) - minutes(b.start_time) || a.room_id.localeCompare(b.room_id);
const when = (iso: string) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? "" : d.toLocaleString([], { dateStyle: "medium", timeStyle: "short" }); };

function useOverview(date: string) {
  const [data, setData] = useState<OverviewData | null>(null);
  const [error, setError] = useState("");
  const generation = useRef(0);
  const load = useCallback(async () => {
    if (!date) return;
    const current = ++generation.current;
    try {
      const response = await fetch(`/api/workflow?date=${date}`, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not load today's data.");
      if (current === generation.current) { setData(body); setError(""); }
    } catch (e) { if (current === generation.current) setError(e instanceof Error ? e.message : "Could not load today's data."); }
  }, [date]);
  useEffect(() => { void load(); const timer = setInterval(load, 15000); return () => { generation.current++; clearInterval(timer); }; }, [load]);
  return { data: data?.date === date ? data : null, error, reload: load };
}

/* ───────────── shared pieces ───────────── */

function groupOf(row: PublishedSession) {
  return `Sem ${row.semester} ${row.section}${row.batch ? " / " + row.batch : ""}`;
}

/** Today, in time order, with the next upcoming class highlighted. */
export function TodaySchedule({ rows, clock, date, role, published, title = "Today" }: { rows: PublishedSession[]; clock: string; date: string; role: Role; published: boolean; title?: string }) {
  const sorted = [...rows].sort(byStart);
  const status = (r: PublishedSession) => timetableStatus(r, clock, date);
  const next = sorted.find(r => status(r) === "upcoming");
  const running = sorted.filter(r => status(r) === "running");
  const remaining = sorted.filter(r => status(r) !== "completed").length;
  const dayName = new Date(date + "T12:00:00").toLocaleDateString([], { weekday: "long", day: "numeric", month: "short" });
  const where = (r: PublishedSession) => role === "student" ? (r.batch ? `Batch ${r.batch}` : r.course_code === "SELF-STUDY" ? "Individual" : "Whole section") : groupOf(r);
  return <section className="rd-panel ov-today" aria-labelledby="ov-today-title">
    <div className="ov-panel-head">
      <h2 id="ov-today-title">{title}</h2>
      <span className="ov-muted">{dayName}{sorted.length ? ` · ${remaining ? `${remaining} of ${sorted.length} still to come` : "all done"}` : ""}</span>
    </div>
    {!published ? <p className="rd-empty">The timetable has not been published yet.</p>
      : !sorted.length ? <p className="rd-empty">No classes scheduled today.</p>
      : <>
        <ol className="ov-schedule">
          {sorted.map(r => {
            const s = status(r);
            const isNext = r === next;
            return <li key={r.entry_id + r.start_time} className={`ov-slot ov-${s}${isNext ? " ov-next" : ""}`} aria-current={isNext ? "true" : undefined}>
              <time className="ov-time">{r.start_time}<span>{r.end_time}</span></time>
              <div className="ov-what">
                <strong>{r.course_name || r.course_code}</strong>
                <span>{[r.course_code && r.course_name ? r.course_code : "", r.session_type, r.room_id, where(r)].filter(Boolean).join(" · ")}</span>
              </div>
              {isNext ? <em className="ov-flag">Next</em> : s === "running" ? <em className="ov-flag ov-flag-now">Now</em> : s === "completed" ? <em className="ov-flag ov-flag-done">Done</em> : null}
            </li>;
          })}
        </ol>
        {!next && !running.length && <p className="rd-empty ov-done">No more classes today.</p>}
      </>}
  </section>;
}

function RequestList({ items, empty, viewer }: { items: Request[]; empty: string; viewer?: string }) {
  if (!items.length) return <p className="ov-empty">{empty}</p>;
  return <ul className="ov-list">{items.map(r => <li key={r.id}>
    <div><strong>{kindText(r.kind)}</strong><span>{viewer && r.owner.id !== viewer ? `From ${r.owner.name} · ` : ""}{r.date}{r.reason ? ` · ${r.reason}` : ""}</span></div>
    <em className={`ov-status ov-status-${statusTone(r.status)}`}>{statusText(r.status)}</em>
  </li>)}</ul>;
}

function Messages({ items, empty }: { items: { id: string; message: string; at?: string }[]; empty: string }) {
  if (!items.length) return <p className="ov-empty">{empty}</p>;
  return <ul className="ov-list ov-messages">{items.map(n => <li key={n.id}><div><span className="ov-message">{n.message}</span>{n.at && <small>{when(n.at)}</small>}</div></li>)}</ul>;
}

/* ───────────── HOD: statistics, charts, then the department timetable ───────────── */

const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const hoursOf = (r: PublishedSession) => (minutes(r.end_time) - minutes(r.start_time)) / 60;
const fmtH = (h: number) => `${(Math.round(h * 10) / 10).toFixed(1)} h`;

/** One chart frame: title, the plot, an optional caption, and a table view of the same numbers. */
function ChartPanel({ title, caption, children, table }: { title: string; caption?: string; children: React.ReactNode; table?: { head: string[]; rows: (string | number)[][] } }) {
  return <section className="rd-panel ov-chart" aria-label={title}>
    <div className="ov-panel-head"><h2>{title}</h2>{caption && <span className="ov-muted">{caption}</span>}</div>
    {children}
    {table && table.rows.length > 0 && <details className="ov-table-view"><summary>Show as table</summary>
      <div className="rd-table-wrap"><table><thead><tr>{table.head.map(h => <th key={h}>{h}</th>)}</tr></thead>
        <tbody>{table.rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody></table></div>
    </details>}
  </section>;
}

/** Sessions per day of the published week: one hue, recessive gridlines, the busiest day labelled, hover for detail. */
export function WeeklySessionsChart({ rows }: { rows: PublishedSession[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const days = DAYS.map((d, i) => { const list = rows.filter(r => r.day === d); return { day: d, name: DAY_NAMES[i], sessions: list.length, hours: list.reduce((n, r) => n + hoursOf(r), 0) }; });
  const max = Math.max(0, ...days.map(d => d.sessions));
  const busiest = days.findIndex(d => d.sessions === max);
  const top = max <= 4 ? 4 : Math.ceil(max / 4) * 4;
  const ticks = [top, top / 2, 0];
  if (!rows.length) return <ChartPanel title="Weekly sessions"><p className="ov-empty">The chart appears once a timetable is published.</p></ChartPanel>;
  return <ChartPanel title="Weekly sessions" caption={`${rows.length} sessions · ${fmtH(rows.reduce((n, r) => n + hoursOf(r), 0))} a week`}
    table={{ head: ["Day", "Sessions", "Teaching hours"], rows: days.map(d => [d.name, d.sessions, fmtH(d.hours)]) }}>
    <div className="ov-cols" role="list" aria-label="Sessions per day">
      <div className="ov-cols-grid" aria-hidden="true">{ticks.map(t => <span key={t} style={{ bottom: `${(t / top) * 100}%` }}><em>{t}</em></span>)}</div>
      {days.map((d, i) => <div key={d.day} className="ov-col" role="listitem" tabIndex={0} aria-label={`${d.name}: ${d.sessions} sessions, ${fmtH(d.hours)}`}
        onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(i)} onBlur={() => setHover(null)}>
        <div className="ov-col-well">
          {i === busiest && max > 0 && <b className="ov-col-label" style={{ bottom: `${(d.sessions / top) * 100}%` }}>{d.sessions}</b>}
          <span className="ov-col-bar" style={{ height: `${(d.sessions / top) * 100}%` }} />
          {hover === i && <span className="ov-tip" role="tooltip" style={{ bottom: `calc(${(d.sessions / top) * 100}% + 26px)` }}><strong>{d.name}</strong>{d.sessions} sessions · {fmtH(d.hours)}</span>}
        </div>
        <span className="ov-col-day">{d.day}</span>
      </div>)}
    </div>
  </ChartPanel>;
}

/** Room utilisation this week (Python sweep-line report over 08:00–17:00), highest first. */
export function RoomUtilChart({ utilization, resources }: { utilization: Record<string, number>; resources: Resource[] }) {
  const hidden = new Set(resources.filter(r => r.type === "workstation" || r.parent).map(r => r.id));
  const list = Object.entries(utilization).filter(([id]) => !hidden.has(id)).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const avg = list.length ? list.reduce((n, [, v]) => n + v, 0) / list.length : 0;
  if (!list.length) return <ChartPanel title="Room utilisation this week"><p className="ov-empty">Utilisation appears once a timetable is published and the week is inside the term.</p></ChartPanel>;
  return <ChartPanel title="Room utilisation this week" caption={`Average ${avg.toFixed(0)}% · 08:00–17:00`}
    table={{ head: ["Room", "Utilisation"], rows: list.map(([id, v]) => [id, `${v.toFixed(1)}%`]) }}>
    <ul className="ov-hbars" aria-label="Utilisation per room">
      {list.map(([id, v]) => <li key={id} title={`${id}: ${v.toFixed(1)}% of teaching hours booked`}>
        <span className="ov-hbar-name">{id}</span>
        <span className="ov-hbar-well"><span className="ov-hbar" style={{ width: `${Math.min(100, Math.max(v, 0))}%` }} /></span>
        <span className="ov-hbar-val">{v.toFixed(0)}%</span>
      </li>)}
    </ul>
  </ChartPanel>;
}

/** The published department timetable: every class, one sheet each (semester · division), no selection needed. */
export function DepartmentTimetable({ rows, clock }: { rows: PublishedSession[]; clock: string }) {
  return <section className="rd-panel ov-timetable" aria-labelledby="ov-tt-title">
    <div className="ov-panel-head">
      <h2 id="ov-tt-title">Department timetable</h2>
    </div>
    {!rows.length ? <p className="rd-empty">No published timetable yet. It appears here after you approve a draft in Scheduling → Timetable review.</p>
      : <WeeklyTimetable rows={rows} clock={clock} expandable />}
  </section>;
}

function HodOverview({ data, clock }: { data: OverviewData; clock: string }) {
  const now = minutes(clock.slice(11, 16) || "00:00");
  const today = [...data.rows].sort(byStart);
  const teachingHours = now >= 480 && now < 1020;
  const rooms = data.resources.filter(r => r.type !== "workstation" && !r.parent);
  const busy = new Set(today.filter(r => minutes(r.start_time) <= now && now < minutes(r.end_time)).map(r => r.room_id));
  const free = rooms.filter(r => !busy.has(r.id)).length;
  const weekly = data.publication?.rows || [];

  return <>
    {/* Department stats shown in place: KPI strip, the two charts, week at a glance and "What to look at". */}
    <DeptStats embedded roomsNow={{
      value: !rooms.length || !teachingHours ? "–" : String(free),
      note: !rooms.length ? "No rooms registered yet" : teachingHours ? `${busy.size} in use · ${rooms.length} rooms in total` : `Outside teaching hours · ${rooms.length} rooms in total`,
    }}>
      <div className="ov-charts">
        <WeeklySessionsChart rows={weekly} />
        <RoomUtilChart utilization={data.utilization} resources={data.resources} />
      </div>
    </DeptStats>
    <DepartmentTimetable rows={weekly} clock={clock} />
  </>;
}

/* ───────────── faculty and student: today + what needs attention ───────────── */

function PersonalOverview({ data, clock, date, role, userId, facultyId }: { data: OverviewData; clock: string; date: string; role: "faculty" | "student"; userId?: string; facultyId?: string }) {
  const base = `/dashboards/${role}`;
  const notifications = data.notifications.slice(-4).reverse();
  let attention: React.ReactNode;
  if (role === "faculty") {
    const consent = data.requests.filter(r => r.status === "pending_consent" && facultyId && r.consents[facultyId] === "pending");
    const mine = data.requests.filter(r => r.owner.id === userId && OPEN.includes(r.status));
    attention = <section className="rd-panel" aria-labelledby="ov-attn">
      <div className="ov-panel-head"><h2 id="ov-attn">Needs your attention</h2><Link href={`${base}/inbox`}>Requests & messages →</Link></div>
      <h3 className="ov-h3">Proposals waiting for your answer{consent.length ? ` (${consent.length})` : ""}</h3>
      <RequestList items={consent} viewer={userId} empty="No proposals need your consent." />
      <h3 className="ov-h3">Your open requests{mine.length ? ` (${mine.length})` : ""}</h3>
      <RequestList items={mine.slice(-4).reverse()} viewer={userId} empty="You have no open requests." />
      <h3 className="ov-h3">Latest messages</h3>
      <Messages items={notifications} empty="No messages yet." />
    </section>;
  } else {
    const mine = data.requests.filter(r => r.owner.id === userId).slice(-4).reverse();
    const announcement = data.announcements.slice(-1);
    attention = <section className="rd-panel" aria-labelledby="ov-attn">
      <div className="ov-panel-head"><h2 id="ov-attn">Updates</h2><Link href={`${base}/inbox`}>My requests & updates →</Link></div>
      <h3 className="ov-h3">Timetable and request updates</h3>
      <Messages items={notifications} empty="No updates yet." />
      <h3 className="ov-h3">My recent requests</h3>
      <RequestList items={mine} viewer={userId} empty="You have not made any requests." />
      {announcement.length > 0 && <><h3 className="ov-h3">Latest announcement</h3><Messages items={announcement} empty="" /></>}
    </section>;
  }
  return <div className="ov-split">
    <TodaySchedule rows={data.rows} clock={clock} date={date} role={role} published={data.published} title={role === "faculty" ? "Today's teaching" : "Today's classes"} />
    {attention}
  </div>;
}

export function RoleOverview({ role, clock, userId, facultyId }: { role: Role; clock: string; userId?: string; facultyId?: string }) {
  const date = clock.slice(0, 10);
  const { data, error, reload } = useOverview(date);
  if (role === "admin") return null;
  if (error && !data) return <p role="alert" className="rd-error">{error} <button type="button" onClick={() => void reload()}>Try again</button></p>;
  if (!data || !clock) return <p className="ov-loading" role="status">Loading today’s overview…</p>;
  return <>
    {error && <p role="alert" className="rd-error">Showing the last loaded data. {error}</p>}
    {role === "hod" ? <HodOverview data={data} clock={clock} />
      : <PersonalOverview data={data} clock={clock} date={date} role={role} userId={userId} facultyId={facultyId} />}
  </>;
}
