"use client";
import { DoorOpen } from "lucide-react";
import { DAYS } from "@/lib/publishedTimetable";
import { DAY_FULL, LIMITS, WEEK_ROOM_HOURS, fmtHours, groupRooms, pct, type DeptStats, type RoomStat } from "@/lib/deptStats";
import { FlagBadges, Panel, Ring, SidePanel, WeekGrid, pressable, tip, tipImg, toneOf } from "./ui";

function RoomRow({ r, onOpen }: { r: RoomStat; onOpen: () => void }) {
  const tone = r.severity === "ok" ? "accent" : toneOf(r.severity);
  const text = `${r.id}${r.name !== r.id ? " · " + r.name : ""}\n${fmtHours(r.usedHours)} of ${WEEK_ROOM_HOURS} h booked (${(r.util * 100).toFixed(1)}%)\n${r.sessions} session${r.sessions === 1 ? "" : "s"} a week`;
  return (
    <div className={`ds-room${r.util > LIMITS.roomHigh ? " is-high" : r.util < LIMITS.roomLow ? " is-low" : ""}`} {...pressable(onOpen, `Open week for room ${r.id}`)}>
      <div className="ds-room-name"><b>{r.id}</b>{r.capacity && <small>{r.capacity} seats</small>}</div>
      <div className="ds-room-bar" {...tipImg(text)}>
        <span className={`ds-room-fill tone-${tone}`} style={{ width: `${Math.min(100, r.util * 100)}%` }} />
        <i className="ds-mark lo" style={{ left: `${LIMITS.roomLow * 100}%` }} {...tip(`${pct(LIMITS.roomLow)}\nBelow this a room counts as underused`)} />
        <i className="ds-mark hi" style={{ left: `${LIMITS.roomHigh * 100}%` }} {...tip(`${pct(LIMITS.roomHigh)}\nAbove this a room is almost fully booked`)} />
      </div>
      <div className="ds-room-val" {...tip(text)}><b>{Math.round(r.util * 100)}%</b><small>{r.usedHours.toFixed(1)} / {WEEK_ROOM_HOURS} h</small></div>
    </div>
  );
}

function RoomDetail({ r }: { r: RoomStat }) {
  const hrs = r.profile.dayMinutes.map(m => m / 60), top = Math.max(...hrs);
  return (
    <div className="ds-detail">
      <div className="ds-detail-head">
        <span className="ds-avatar lg"><DoorOpen size={22} /></span>
        <div><h2 className="ds-detail-title">{r.id}</h2><div className="ds-sub">{r.name !== r.id ? `${r.name} · ` : ""}{r.type.replace("_", " ")}{r.inferred ? " (inferred)" : ""}{r.capacity ? ` · ${r.capacity} seats` : ""}{r.building ? ` · ${r.building}` : ""}</div></div>
      </div>
      {r.flags.length > 0 && <div className="ds-flaglist">{r.flags.map(fl => <div key={fl.id} className={`ds-flagrow tone-${fl.severity}`}><FlagBadges flags={[fl]} max={1} /><span>{fl.detail}</span></div>)}</div>}
      <div className="ds-detail-stats">
        <Ring size={88} stroke={7} tone={r.severity === "ok" ? "accent" : toneOf(r.severity)} value={r.util} tipText={`${r.id}: ${(r.util * 100).toFixed(1)}% booked\n${fmtHours(r.usedHours)} of ${WEEK_ROOM_HOURS} h`}>
          <strong>{Math.round(r.util * 100)}%</strong><small>booked</small>
        </Ring>
        <dl>
          <div {...tip(`${r.sessions} sessions in the published timetable`)}><dt>Booked</dt><dd>{fmtHours(r.usedHours)}<small>of {WEEK_ROOM_HOURS} h</small></dd></div>
          <div {...tip(top ? `${DAY_FULL[hrs.indexOf(top)]}: ${fmtHours(top)}` : "Never booked")}><dt>Busiest day</dt><dd>{top ? DAYS[hrs.indexOf(top)] : "None"}{top > 0 && <small>{fmtHours(top)}</small>}</dd></div>
        </dl>
      </div>
      <h3 className="ds-h3">Full week</h3>
      <WeekGrid rows={r.profile.rows} label={x => ({ main: x.course_code, sub: `${x.semester}${x.section}${x.batch ? "/" + x.batch : ""}` })} />
    </div>
  );
}

export function RoomsTab({ stats, openId, onOpen, filtered }: { stats: DeptStats; openId: string | null; onOpen: (id: string | null) => void; filtered: boolean }) {
  const groups = groupRooms(stats.rooms);
  const open = stats.rooms.find(r => r.id === openId) || null;
  if (!stats.rooms.length) return <Panel><p className="ds-empty">No rooms are used in the published timetable.</p></Panel>;
  return (
    <>
      <div className="ds-toolbar">
        <span className="ds-muted">Booked hours out of {WEEK_ROOM_HOURS} a week (Mon to Sat, 08:00–17:00). Amber rows are under {pct(LIMITS.roomLow)}, coral rows are over {pct(LIMITS.roomHigh)}.</span>
        {filtered && <span className="ds-pill" {...tip("Rooms are shared across semesters\nThese figures always cover the whole department")}>Whole department</span>}
      </div>
      {groups.map(g => (
        <Panel key={g.group} title={g.group} aside={<span className="ds-muted" {...tip(`${g.rooms.length} room${g.rooms.length === 1 ? "" : "s"}\nAverage ${(g.avg * 100).toFixed(1)}% booked`)}>{g.rooms.length} room{g.rooms.length === 1 ? "" : "s"} · {Math.round(g.avg * 100)}% on average</span>}>
          <div className="ds-rooms">{g.rooms.map(r => <RoomRow key={r.id} r={r} onOpen={() => onOpen(r.id)} />)}</div>
          {g.rooms.some(r => r.inferred) && <p className="ds-note">The uploaded file has no room type for {g.rooms.filter(r => r.inferred).map(r => r.id).join(", ")}, so {g.rooms.filter(r => r.inferred).length === 1 ? "it is" : "they are"} placed here from the sessions held there.</p>}
        </Panel>
      ))}
      <SidePanel open={!!open} onClose={() => onOpen(null)} label={open ? `Room ${open.id} week` : "Details"}>{open && <RoomDetail r={open} />}</SidePanel>
    </>
  );
}
