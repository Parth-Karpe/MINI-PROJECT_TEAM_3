"use client";
import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ChartGantt, LayoutGrid, Table2 } from "lucide-react";
import { DAYS, minutes, type PublishedSession } from "@/lib/publishedTimetable";
import { DAY_FULL, bySeverityDesc, clock, fmtDur, fmtHours, type DeptStats, type FacultyStat } from "@/lib/deptStats";
import { Block, FlagBadges, HourAxis, MixBar, Panel, Ring, SidePanel, Tabs, WeekGrid, WeekStrip, pressable, tip, toneOf, type Tone } from "./ui";

type View = "cards" | "table" | "timeline";

/** Ring: full circle = 150% of the department average, white tick = the average itself. */
const RING_SCALE = 1.5;
const loadFlag = (f: FacultyStat) => f.flags.find(x => x.id === "heavy" || x.id === "light");
const loadTone = (f: FacultyStat): Tone => { const fl = loadFlag(f); return fl ? toneOf(fl.severity) : "accent"; };
const isMixFlag = (id: string) => id === "morning" || id === "afternoon";
const signed = (n: number) => `${n >= 0 ? "+" : "−"}${Math.abs(n).toFixed(1)} h`;

function HoursRing({ f, size = 76 }: { f: FacultyStat; size?: number }) {
  return (
    <Ring size={size} stroke={7} tone={loadTone(f)} value={f.avg ? f.hours / (f.avg * RING_SCALE) : 0} mark={1 / RING_SCALE}
      tipText={`${f.name}: ${fmtHours(f.hours)} a week\nDepartment average ${fmtHours(f.avg)} (${signed(f.hours - f.avg)})\nThe white tick marks the average`}>
      <strong>{f.hours.toFixed(1)}</strong><small>h / week</small>
    </Ring>
  );
}

function FacultyCard({ f, onOpen }: { f: FacultyStat; onOpen: () => void }) {
  const mixFlag = f.flags.find(x => isMixFlag(x.id));
  const others = f.flags.filter(x => !isMixFlag(x.id));
  return (
    <div className={`ds-card ds-person sev-${f.severity}`} {...pressable(onOpen, `Open details for ${f.name}`)}>
      <div className="ds-person-head">
        <span className="ds-avatar" {...tip(`${f.name}\n${f.id}`)}>{f.initials}</span>
        <div className="ds-person-id"><div className="ds-name">{f.name}</div><div className="ds-sub">{f.id} · {f.courses.length} course{f.courses.length === 1 ? "" : "s"} · {f.profile.daysActive} day{f.profile.daysActive === 1 ? "" : "s"}</div></div>
      </div>
      <div className="ds-person-metrics">
        <HoursRing f={f} />
        <div className="ds-person-mix">
          <div className="ds-delta" {...tip(`Against the department average\n${fmtHours(f.hours)} vs ${fmtHours(f.avg)}`)}>{signed(f.hours - f.avg)} <span>vs dept avg</span></div>
          <MixBar morning={f.profile.morningMin} afternoon={f.profile.afternoonMin} />
          <div className="ds-mix-legend"><span className="am">{(f.profile.morningMin / 60).toFixed(1)} h am</span><span className="pm">{(f.profile.afternoonMin / 60).toFixed(1)} h pm</span>{mixFlag && <FlagBadges flags={[mixFlag]} max={1} />}</div>
        </div>
      </div>
      <WeekStrip profile={f.profile} who={f.name} />
      <div className="ds-card-foot">{others.length ? <FlagBadges flags={others} /> : <span className="ds-ok-note">{mixFlag ? "No other flags" : "No flags"}</span>}</div>
    </div>
  );
}

function FacultyDetail({ f }: { f: FacultyStat }) {
  const l = f.profile.longest;
  return (
    <div className="ds-detail">
      <div className="ds-detail-head">
        <span className="ds-avatar lg">{f.initials}</span>
        <div><h2 className="ds-detail-title">{f.name}</h2><div className="ds-sub">{f.id} · {f.profile.daysActive} teaching day{f.profile.daysActive === 1 ? "" : "s"}</div></div>
      </div>
      {f.flags.length > 0 && <div className="ds-flaglist">{f.flags.map(fl => <div key={fl.id} className={`ds-flagrow tone-${fl.severity}`}><FlagBadges flags={[fl]} max={1} /><span>{fl.detail}</span></div>)}</div>}
      <div className="ds-detail-stats">
        <HoursRing f={f} size={88} />
        <dl>
          <div {...tip("Average weekly hours across the faculty in this view")}><dt>Department average</dt><dd>{fmtHours(f.avg)}</dd></div>
          <div {...tip(l ? `${DAY_FULL[l.day]} ${clock(l.start)}–${clock(l.end)}\nBack-to-back with breaks of 15 minutes or less` : "No sessions")}><dt>Longest stretch</dt><dd>{l ? fmtDur(l.teaching) : "None"}{l && <small>{DAYS[l.day]} {clock(l.start)}–{clock(l.end)}</small>}</dd></div>
        </dl>
      </div>
      <h3 className="ds-h3">Morning and afternoon</h3>
      <MixBar morning={f.profile.morningMin} afternoon={f.profile.afternoonMin} />
      <div className="ds-mix-legend"><span className="am">{(f.profile.morningMin / 60).toFixed(1)} h morning</span><span className="pm">{(f.profile.afternoonMin / 60).toFixed(1)} h afternoon</span></div>
      <h3 className="ds-h3">Full week</h3>
      <WeekGrid rows={f.profile.rows} label={r => ({ main: r.course_code, sub: r.room_id })} />
      <h3 className="ds-h3">Courses</h3>
      <ul className="ds-courses">
        {f.courses.map(c => (
          <li key={c.code} {...tip(`${c.name}\n${c.sessions} session${c.sessions === 1 ? "" : "s"} · ${fmtHours(c.hours)} a week\n${c.groups.join(", ")}`)}>
            <div><b>{c.code}</b><span>{c.name}</span></div>
            <small>{c.types.join(", ")} · {c.groups.join(", ")}</small>
            <em>{fmtHours(c.hours)}</em>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ───────────── table ───────────── */

type SortKey = "flags" | "name" | "hours" | "dev" | "stretch";
function FacultyTable({ list, onOpen }: { list: FacultyStat[]; onOpen: (id: string) => void }) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "flags", dir: 1 });
  const rows = useMemo(() => {
    const val = (f: FacultyStat) => sort.key === "name" ? f.name : sort.key === "hours" ? f.hours : sort.key === "dev" ? f.dev : sort.key === "stretch" ? f.profile.longest?.teaching || 0 : 0;
    return [...list].sort((a, b) => {
      if (sort.key === "flags") return sort.dir * (bySeverityDesc(a.severity, b.severity) || b.flags.length - a.flags.length || a.name.localeCompare(b.name));
      const x = val(a), y = val(b);
      return sort.dir * (typeof x === "string" ? x.localeCompare(y as string) : (x as number) - (y as number)) || a.name.localeCompare(b.name);
    });
  }, [list, sort]);
  const maxHours = Math.max(1, ...list.map(f => f.hours));
  const th = (key: SortKey, label: string) => (
    <th aria-sort={sort.key === key ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
      <button type="button" className="ds-th" onClick={() => setSort(s => s.key === key ? { key, dir: (s.dir * -1) as 1 | -1 } : { key, dir: key === "name" || key === "flags" ? 1 : -1 })}>
        {label}{sort.key === key && (sort.dir === 1 ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
      </button>
    </th>
  );
  return (
    <div className="ds-table-wrap">
      <table className="ds-table">
        <thead><tr>{th("name", "Faculty")}{th("hours", "Hours a week")}{th("dev", "Vs average")}<th>Morning / afternoon</th>{th("stretch", "Longest stretch")}{th("flags", "Flags")}</tr></thead>
        <tbody>
          {rows.map(f => (
            <tr key={f.id} className={`sev-${f.severity}`} onClick={() => onOpen(f.id)}>
              <td><button type="button" className="ds-rowlink" onClick={e => { e.stopPropagation(); onOpen(f.id); }}><span className="ds-avatar sm">{f.initials}</span><span>{f.name}<small>{f.id}</small></span></button></td>
              <td><div className="ds-inline-bar" {...tip(`${fmtHours(f.hours)} a week`)}><span className={`tone-${loadTone(f)}`} style={{ width: `${(f.hours / maxHours) * 100}%` }} /></div><b className="ds-num">{f.hours.toFixed(1)}</b></td>
              <td className="ds-num" {...tip(`${fmtHours(f.hours)} vs ${fmtHours(f.avg)} average`)}>{signed(f.hours - f.avg)}</td>
              <td className="ds-mixcell"><MixBar morning={f.profile.morningMin} afternoon={f.profile.afternoonMin} /></td>
              <td className="ds-num" {...tip(f.profile.longest ? `${DAY_FULL[f.profile.longest.day]} ${clock(f.profile.longest.start)}–${clock(f.profile.longest.end)}` : "No sessions")}>{f.profile.longest ? fmtDur(f.profile.longest.teaching) : "–"}</td>
              <td>{f.flags.length ? <FlagBadges flags={f.flags} max={3} /> : <span className="ds-ok-note">None</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ───────────── timeline: days are lanes, one row per teacher ───────────── */

function Timeline({ list, focus, setFocus }: { list: FacultyStat[]; focus: string | null; setFocus: (id: string | null) => void }) {
  const [hot, setHot] = useState<string | null>(null);
  const shown = focus ? list.filter(f => f.id === focus) : [...list].sort((a, b) => a.name.localeCompare(b.name));
  return (
    <div className="ds-tl">
      <div className="ds-tl-pick" role="group" aria-label="Show one teacher">
        <button type="button" className={!focus ? "on" : ""} onClick={() => setFocus(null)}>Everyone</button>
        {[...list].sort((a, b) => a.name.localeCompare(b.name)).map(f => (
          <button type="button" key={f.id} className={focus === f.id ? "on" : ""} aria-pressed={focus === f.id} onClick={() => setFocus(focus === f.id ? null : f.id)} {...tip(f.name)}>{f.initials}</button>
        ))}
      </div>
      <div className="ds-tl-scroll"><div className="ds-tl-inner">
      <div className="ds-tl-head"><span /><span /><HourAxis /></div>
      {DAYS.map((d, di) => {
        const teaching = shown.map(f => ({ f, rows: f.profile.rows.filter(r => r.day === d) })).filter(x => x.rows.length);
        return (
          <div className="ds-tl-lane" key={d}>
            <span className="ds-tl-day" {...tip(DAY_FULL[di])}>{d}</span>
            <div className="ds-tl-rows">
              {teaching.length === 0 && <div className="ds-tl-row"><span className="ds-tl-who" /><div className="ds-track ds-track-empty"><em>No classes</em></div></div>}
              {teaching.map(({ f, rows }) => (
                <div key={f.id} className={`ds-tl-row${hot && hot !== f.id ? " is-dim" : ""}`} onMouseEnter={() => setHot(f.id)} onMouseLeave={() => setHot(null)}>
                  <span className="ds-tl-who" {...tip(`${f.name}\n${f.id}`)}>{f.initials}</span>
                  <div className="ds-track">{rows.map((r: PublishedSession) => <Block key={r.entry_id} r={r} main={r.course_code} who={f.name} />)}</div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
      </div></div>
      <p className="ds-note">Each row is one teacher. Hover a row to isolate it, or pick someone above to see only their week.</p>
    </div>
  );
}

/* ───────────── tab ───────────── */

export function FacultyTab({ stats, openId, onOpen }: { stats: DeptStats; openId: string | null; onOpen: (id: string | null) => void }) {
  const [view, setView] = useState<View>("cards");
  const [focus, setFocus] = useState<string | null>(null);
  const { list, avg } = stats.faculty;
  const open = list.find(f => f.id === openId) || null;
  return (
    <>
      <div className="ds-toolbar">
        <Tabs variant="segmented" label="Faculty view" value={view} onChange={setView} items={[
          { id: "cards", label: "Cards", icon: <LayoutGrid size={14} /> }, { id: "table", label: "Table", icon: <Table2 size={14} /> }, { id: "timeline", label: "Timeline", icon: <ChartGantt size={14} /> },
        ]} />
        <span className="ds-muted">{list.length} faculty · department average {fmtHours(avg)} a week{view === "cards" ? " · flagged first" : ""}</span>
      </div>
      {list.length === 0 ? <Panel><p className="ds-empty">No faculty sessions match this filter.</p></Panel>
        : view === "cards" ? <div className="ds-cards">{list.map(f => <FacultyCard key={f.id} f={f} onOpen={() => onOpen(f.id)} />)}</div>
        : view === "table" ? <Panel><FacultyTable list={list} onOpen={onOpen} /></Panel>
        : <Panel><Timeline list={list} focus={focus} setFocus={setFocus} /></Panel>}
      <SidePanel open={!!open} onClose={() => onOpen(null)} label={open ? `${open.name} details` : "Details"}>{open && <FacultyDetail f={open} />}</SidePanel>
    </>
  );
}
