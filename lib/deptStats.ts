/**
 * Department statistics for the HOD dashboard.
 *
 * Everything here is a pure function of the *published* timetable rows (plus the optional
 * resource list), so it can be unit-tested without React. The numbers measure scheduled
 * occupancy, not attendance.
 */
import { DAYS, facultyIds, minutes, type CsvResource, type PublishedSession } from "./publishedTimetable";

export type Interval = [number, number];
export type Severity = "ok" | "watch" | "problem";
export type IconKey = "sunrise" | "sunset" | "flame" | "gauge" | "hourglass" | "door" | "door-open" | "layers" | "clock" | "clash" | "check";

export const DAY_FULL = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const DAY_START = 480; // 08:00
export const DAY_END = 1020; // 17:00
/** Start hour of each of the 9 hourly columns: 8 … 16. */
export const HOURS = Array.from({ length: (DAY_END - DAY_START) / 60 }, (_, i) => DAY_START / 60 + i);
/** 6 days × 9 hours = 54, the same denominator the main HOD dashboard uses. */
export const WEEK_ROOM_HOURS = (DAYS.length * (DAY_END - DAY_START)) / 60;
/** Tea breaks and lunch. A hole in a day that falls inside these is not a "free period". */
const BREAKS: Interval[] = [[600, 615], [675, 690], [750, 810], [930, 945]];

/** Every threshold that turns a number into a flag lives here so it is easy to tune. */
export const LIMITS = {
  morningEnds: 750, // 12:30, when lunch starts
  lopsidedShare: 0.75, // ≥75% of a person's hours on one side of lunch
  lopsidedMinHours: 4, // …but only worth flagging past this many weekly hours
  loadWatch: 0.25, // ±25% from the department average
  loadProblem: 0.5, // +50% above the average
  minFacultyForLoad: 3, // below this, an "average" says little
  longStretch: 240, // minutes of back-to-back teaching
  stretchBreak: 15, // a gap this short (tea break) does not break a stretch
  roomLow: 0.2,
  roomHigh: 0.85,
  dayHeavyHours: 6,
  dayProblemHours: 7,
  dayRatio: 1.6, // busiest day vs the mean of the days that have classes
  gapMinutes: 45, // shortest hole that counts as a free period
  gapWeekHours: 3,
  fairnessOk: 0.85,
  fairnessWatch: 0.7,
} as const;

/* ───────────────────────── helpers ───────────────────────── */

export const clock = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
export const hoursOf = (m: number) => m / 60;
export const fmtHours = (h: number) => `${(Math.round(h * 10) / 10).toFixed(1)} h`;
export const fmtDur = (m: number) => (m % 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${Math.floor(m / 60)}h`);
export const pct = (v: number) => `${Math.round(v * 100)}%`;
const sevRank: Record<Severity, number> = { ok: 0, watch: 1, problem: 2 };
export const worst = (list: { severity: Severity }[]): Severity => list.reduce<Severity>((w, f) => (sevRank[f.severity] > sevRank[w] ? f.severity : w), "ok");
export const bySeverityDesc = (a: Severity, b: Severity) => sevRank[b] - sevRank[a];

export function mergeIntervals(list: Interval[]): Interval[] {
  const sorted = list.filter(([s, e]) => e > s).map(([s, e]) => [s, e] as Interval).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const out: Interval[] = [];
  for (const [s, e] of sorted) {
    const last = out[out.length - 1];
    if (last && s <= last[1]) last[1] = Math.max(last[1], e);
    else out.push([s, e]);
  }
  return out;
}

/** Minutes of `merged` that fall inside [lo, hi). */
export function covered(merged: Interval[], lo: number, hi: number): number {
  let sum = 0;
  for (const [s, e] of merged) sum += Math.max(0, Math.min(e, hi) - Math.max(s, lo));
  return sum;
}

/** Jain's fairness index: 1 = everyone equal, 1/n = one person has everything. */
export function jain(values: number[]): number | null {
  if (values.length < 2) return null;
  const sum = values.reduce((a, b) => a + b, 0);
  const squares = values.reduce((a, b) => a + b * b, 0);
  return squares === 0 ? null : (sum * sum) / (values.length * squares);
}

function subtractBreaks(piece: Interval): Interval[] {
  let pieces: Interval[] = [piece];
  for (const [b0, b1] of BREAKS) {
    pieces = pieces.flatMap(([p0, p1]): Interval[] => {
      if (b1 <= p0 || b0 >= p1) return [[p0, p1]];
      const out: Interval[] = [];
      if (b0 > p0) out.push([p0, b0]);
      if (p1 > b1) out.push([b1, p1]);
      return out;
    });
  }
  return pieces;
}

export function initialsOf(name: string, id: string): string {
  const words = name.replace(/\b(dr|prof|mr|mrs|ms)\b\.?/gi, " ").split(/[\s.]+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  const single = (words[0] || id).replace(/[^A-Za-z0-9]/g, "");
  return single.slice(0, 2).toUpperCase() || id.slice(0, 2).toUpperCase();
}

export function sessionLine(r: PublishedSession): string {
  const who = `Sem ${r.semester} ${r.section}${r.batch ? "/" + r.batch : ""}`;
  return `${r.course_code} ${r.session_type} ${r.start_time}–${r.end_time} · ${r.room_id} · ${r.faculty_id} · ${who}`;
}

/* ───────────────────────── profile of any set of sessions ───────────────────────── */

export interface GridCell { minutes: number; sessions: PublishedSession[] }
export interface Stretch { day: number; start: number; end: number; teaching: number }
export interface Profile {
  rows: PublishedSession[];
  merged: Interval[][];
  dayMinutes: number[];
  daySessions: number[];
  minutes: number;
  hours: number;
  morningMin: number;
  afternoonMin: number;
  grid: GridCell[][]; // [day][hour column]
  gaps: Interval[][]; // free periods per day
  gapMinutes: number;
  longest: Stretch | null;
  daysActive: number;
  clashes: number;
}

export function buildProfile(rows: PublishedSession[]): Profile {
  const byDay: PublishedSession[][] = DAYS.map(() => []);
  for (const r of rows) {
    const d = DAYS.indexOf(r.day);
    if (d >= 0) byDay[d].push(r);
  }
  const span = (r: PublishedSession): Interval => [minutes(r.start_time), minutes(r.end_time)];
  const merged = byDay.map(list => mergeIntervals(list.map(span)));
  const dayMinutes = merged.map(m => m.reduce((n, [s, e]) => n + (e - s), 0));
  let morningMin = 0;
  for (const day of merged) morningMin += covered(day, 0, LIMITS.morningEnds);
  const total = dayMinutes.reduce((a, b) => a + b, 0);

  let clashes = 0;
  byDay.forEach(list => {
    let maxEnd = -1;
    for (const r of [...list].sort((a, b) => minutes(a.start_time) - minutes(b.start_time))) {
      if (minutes(r.start_time) < maxEnd) clashes++;
      maxEnd = Math.max(maxEnd, minutes(r.end_time));
    }
  });

  const grid = byDay.map((list, d) => HOURS.map((h): GridCell => {
    const lo = h * 60, hi = lo + 60;
    return {
      minutes: covered(merged[d], lo, hi),
      sessions: list.filter(r => minutes(r.start_time) < hi && minutes(r.end_time) > lo).sort((a, b) => minutes(a.start_time) - minutes(b.start_time)),
    };
  }));

  const gaps = merged.map(day => {
    const out: Interval[] = [];
    for (let i = 0; i + 1 < day.length; i++) {
      for (const piece of subtractBreaks([day[i][1], day[i + 1][0]])) if (piece[1] - piece[0] >= LIMITS.gapMinutes) out.push(piece);
    }
    return out;
  });
  const gapMinutes = gaps.reduce((n, day) => n + day.reduce((m, [s, e]) => m + (e - s), 0), 0);

  let longest: Stretch | null = null;
  merged.forEach((day, d) => {
    let start = 0, end = 0, teaching = 0;
    const close = () => { if (teaching && (!longest || teaching > longest.teaching)) longest = { day: d, start, end, teaching }; };
    day.forEach(([s, e], i) => {
      if (i > 0 && s - end <= LIMITS.stretchBreak) { end = e; teaching += e - s; }
      else { close(); start = s; end = e; teaching = e - s; }
    });
    close();
  });

  return {
    rows, merged, dayMinutes, daySessions: byDay.map(l => l.length), minutes: total, hours: total / 60,
    morningMin, afternoonMin: total - morningMin, grid, gaps, gapMinutes, longest,
    daysActive: dayMinutes.filter(Boolean).length, clashes,
  };
}

/* ───────────────────────── flags ───────────────────────── */

export interface Flag { id: string; severity: Exclude<Severity, "ok">; label: string; detail: string; icon: IconKey }

/* ───────────────────────── faculty ───────────────────────── */

export interface CourseLine { code: string; name: string; sessions: number; hours: number; types: string[]; groups: string[] }
export interface FacultyStat {
  id: string; name: string; initials: string; profile: Profile;
  hours: number; avg: number; dev: number; morningShare: number;
  flags: Flag[]; severity: Severity; courses: CourseLine[];
}

function facultyDirectory(rows: PublishedSession[]): Map<string, { name: string; rows: PublishedSession[] }> {
  const map = new Map<string, { name: string; rows: PublishedSession[] }>();
  for (const r of rows) {
    const ids = facultyIds(r);
    const names = r.faculty_name.split(/[;,|]/).map(s => s.trim()).filter(Boolean);
    ids.forEach((id, i) => {
      const guess = ids.length === 1 ? r.faculty_name.trim() : names.length === ids.length ? names[i] : "";
      const entry = map.get(id) || { name: id, rows: [] };
      if (guess && entry.name === id) entry.name = guess;
      entry.rows.push(r);
      map.set(id, entry);
    });
  }
  return map;
}

export function computeFaculty(rows: PublishedSession[]): { list: FacultyStat[]; avg: number; fairness: number | null } {
  const dir = [...facultyDirectory(rows).entries()];
  const profiles = dir.map(([, v]) => buildProfile(v.rows));
  const avg = profiles.length ? profiles.reduce((n, p) => n + p.hours, 0) / profiles.length : 0;
  const list = dir.map(([id, v], i): FacultyStat => {
    const profile = profiles[i];
    const dev = avg > 0 ? profile.hours / avg - 1 : 0;
    const morningShare = profile.minutes ? profile.morningMin / profile.minutes : 0;
    const flags: Flag[] = [];
    if (profile.clashes) flags.push({ id: "clash", severity: "problem", icon: "clash", label: `${profile.clashes} clash${profile.clashes > 1 ? "es" : ""}`, detail: "Overlapping sessions in this person's week." });
    if (profile.hours >= LIMITS.lopsidedMinHours) {
      if (morningShare >= LIMITS.lopsidedShare) flags.push({ id: "morning", severity: "watch", icon: "sunrise", label: `${pct(morningShare)} morning`, detail: `${fmtHours(profile.morningMin / 60)} before lunch, ${fmtHours(profile.afternoonMin / 60)} after. Flagged at ${pct(LIMITS.lopsidedShare)} or more on one side.` });
      else if (1 - morningShare >= LIMITS.lopsidedShare) flags.push({ id: "afternoon", severity: "watch", icon: "sunset", label: `${pct(1 - morningShare)} afternoon`, detail: `${fmtHours(profile.afternoonMin / 60)} after lunch, ${fmtHours(profile.morningMin / 60)} before. Flagged at ${pct(LIMITS.lopsidedShare)} or more on one side.` });
    }
    if (dir.length >= LIMITS.minFacultyForLoad) {
      if (dev > LIMITS.loadProblem) flags.push({ id: "heavy", severity: "problem", icon: "flame", label: `+${Math.round(dev * 100)}% hours`, detail: `${fmtHours(profile.hours)} a week against a department average of ${fmtHours(avg)}.` });
      else if (dev > LIMITS.loadWatch) flags.push({ id: "heavy", severity: "watch", icon: "flame", label: `+${Math.round(dev * 100)}% hours`, detail: `${fmtHours(profile.hours)} a week against a department average of ${fmtHours(avg)}.` });
      else if (dev < -LIMITS.loadWatch) flags.push({ id: "light", severity: "watch", icon: "gauge", label: `${Math.round(dev * 100)}% hours`, detail: `${fmtHours(profile.hours)} a week against a department average of ${fmtHours(avg)}.` });
    }
    if (profile.longest && profile.longest.teaching >= LIMITS.longStretch) {
      const l = profile.longest;
      flags.push({ id: "stretch", severity: "watch", icon: "hourglass", label: `${fmtDur(l.teaching)} straight`, detail: `${DAY_FULL[l.day]} ${clock(l.start)}–${clock(l.end)} with only short breaks.` });
    }
    const courses = new Map<string, CourseLine>();
    for (const r of v.rows) {
      const c = courses.get(r.course_code) || { code: r.course_code, name: r.course_name, sessions: 0, hours: 0, types: [], groups: [] };
      c.sessions++; c.hours += (minutes(r.end_time) - minutes(r.start_time)) / 60;
      if (!c.types.includes(r.session_type)) c.types.push(r.session_type);
      const g = `Sem ${r.semester} ${r.section}${r.batch ? "/" + r.batch : ""}`;
      if (!c.groups.includes(g)) c.groups.push(g);
      courses.set(r.course_code, c);
    }
    const name = dir[i][1].name;
    return { id, name, initials: initialsOf(name, id), profile, hours: profile.hours, avg, dev, morningShare, flags, severity: worst(flags), courses: [...courses.values()].sort((a, b) => b.hours - a.hours) };
  });
  list.sort((a, b) => bySeverityDesc(a.severity, b.severity) || a.name.localeCompare(b.name));
  return { list, avg, fairness: jain(profiles.map(p => p.hours)) };
}

/* ───────────────────────── classes ───────────────────────── */

export interface ClassUnit { key: string; label: string; batch: string; profile: Profile; flags: Flag[]; severity: Severity }
export interface ClassCard { key: string; semester: string; section: string; sessions: number; units: ClassUnit[]; flags: Flag[]; severity: Severity }

function unitFlags(p: Profile): Flag[] {
  const flags: Flag[] = [];
  if (p.clashes) flags.push({ id: "clash", severity: "problem", icon: "clash", label: `${p.clashes} clash${p.clashes > 1 ? "es" : ""}`, detail: "Overlapping sessions in this group's week." });
  const hours = p.dayMinutes.map(m => m / 60);
  const active = hours.filter(Boolean);
  const max = Math.max(0, ...hours);
  const day = hours.indexOf(max);
  const mean = active.length ? active.reduce((a, b) => a + b, 0) / active.length : 0;
  if (max >= LIMITS.dayProblemHours) flags.push({ id: "day", severity: "problem", icon: "layers", label: `${DAYS[day]} ${fmtHours(max)}`, detail: `${DAY_FULL[day]} has ${fmtHours(max)} of classes in a 9-hour day.` });
  else if (max >= LIMITS.dayHeavyHours || (active.length >= 3 && max >= 4 && max >= LIMITS.dayRatio * mean))
    flags.push({ id: "day", severity: "watch", icon: "layers", label: `${DAYS[day]} ${fmtHours(max)}`, detail: `${DAY_FULL[day]} has ${fmtHours(max)} against ${fmtHours(mean)} on an average teaching day.` });
  if (p.gapMinutes / 60 >= LIMITS.gapWeekHours) flags.push({ id: "gaps", severity: "watch", icon: "clock", label: `${fmtHours(p.gapMinutes / 60)} free gaps`, detail: `Free periods of ${LIMITS.gapMinutes}+ minutes between classes, lunch and tea breaks excluded.` });
  return flags;
}

export function computeClasses(rows: PublishedSession[]): ClassCard[] {
  const groups = new Map<string, PublishedSession[]>();
  for (const r of rows) {
    const k = `${r.semester}:${r.section}`;
    groups.set(k, [...(groups.get(k) || []), r]);
  }
  return [...groups.entries()].map(([key, list]): ClassCard => {
    const [semester, section] = key.split(":");
    const batches = [...new Set(list.map(r => r.batch).filter(Boolean))].sort();
    const unitRows: [string, string, PublishedSession[]][] = batches.length
      ? batches.map(b => [b, b, list.filter(r => !r.batch || r.batch === b)])
      : [["", "Whole section", list]];
    const units = unitRows.map(([batch, label, rs]): ClassUnit => {
      const profile = buildProfile(rs);
      const flags = unitFlags(profile);
      return { key: `${key}:${batch || "all"}`, label, batch, profile, flags, severity: worst(flags) };
    });
    const flags = units.flatMap(u => u.flags.map(f => ({ ...f, label: units.length > 1 ? `${u.label} · ${f.label}` : f.label })));
    return { key, semester, section, sessions: list.length, units, flags, severity: worst(flags) };
  }).sort((a, b) => Number(a.semester) - Number(b.semester) || a.section.localeCompare(b.section));
}

/* ───────────────────────── rooms ───────────────────────── */

export interface RoomStat {
  id: string; name: string; type: string; inferred: boolean; group: string;
  capacity: number | null; building: string | null; profile: Profile;
  usedHours: number; util: number; sessions: number; severity: Severity; flags: Flag[];
}
const GROUP_NAMES: Record<string, string> = { lab: "Labs", classroom: "Classrooms", hall: "Halls", meeting_room: "Meeting rooms", workstation: "Workstations", equipment: "Equipment" };
const GROUP_ORDER = ["Labs", "Classrooms"];

export function computeRooms(rows: PublishedSession[], resources: CsvResource[] = []): RoomStat[] {
  const ids = [...new Set(rows.map(r => r.room_id))].sort();
  return ids.map((id): RoomStat => {
    const rs = rows.filter(r => r.room_id === id);
    const res = resources.find(r => r.id === id);
    const known = res?.type || rs.find(r => r.room_type)?.room_type || null;
    const inferred = !known;
    const type = known || (rs.some(r => r.session_type === "lab") || /lab/i.test(id) ? "lab" : "classroom");
    const profile = buildProfile(rs);
    const util = profile.hours / WEEK_ROOM_HOURS;
    const flags: Flag[] = [];
    if (profile.clashes) flags.push({ id: "clash", severity: "problem", icon: "clash", label: `${profile.clashes} clash${profile.clashes > 1 ? "es" : ""}`, detail: "Overlapping bookings in this room." });
    if (util > LIMITS.roomHigh) flags.push({ id: "high", severity: "problem", icon: "door", label: `${pct(util)} booked`, detail: `${fmtHours(profile.hours)} of ${WEEK_ROOM_HOURS} h. Above ${pct(LIMITS.roomHigh)} leaves almost no room for extra requests.` });
    else if (util < LIMITS.roomLow) flags.push({ id: "low", severity: "watch", icon: "door-open", label: `${pct(util)} used`, detail: `${fmtHours(profile.hours)} of ${WEEK_ROOM_HOURS} h. Below ${pct(LIMITS.roomLow)} is spare capacity.` });
    return {
      id, name: res?.name || rs.find(r => r.room_name)?.room_name || id, type, inferred, group: GROUP_NAMES[type] || type,
      capacity: res?.capacity ?? rs.find(r => r.room_capacity)?.room_capacity ?? null, building: res?.building || rs.find(r => r.building)?.building || null,
      profile, usedHours: profile.hours, util, sessions: rs.length, severity: worst(flags), flags,
    };
  }).sort((a, b) => b.util - a.util || a.id.localeCompare(b.id));
}

export function groupRooms(rooms: RoomStat[]): { group: string; rooms: RoomStat[]; avg: number }[] {
  const names = [...new Set(rooms.map(r => r.group))].sort((a, b) => {
    const ia = GROUP_ORDER.indexOf(a), ib = GROUP_ORDER.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
  });
  return names.map(group => {
    const list = rooms.filter(r => r.group === group);
    return { group, rooms: list, avg: list.reduce((n, r) => n + r.util, 0) / list.length };
  });
}

/* ───────────────────────── overview ───────────────────────── */

export interface HeatCell { day: number; hour: number; sessions: number; rooms: number; faculty: number }
export function computeHeat(rows: PublishedSession[]): { cells: HeatCell[][]; max: number } {
  let max = 0;
  const cells = DAYS.map((d, di) => HOURS.map((h): HeatCell => {
    const lo = h * 60, hi = lo + 60;
    const live = rows.filter(r => r.day === d && minutes(r.start_time) < hi && minutes(r.end_time) > lo);
    const cell = { day: di, hour: h, sessions: live.length, rooms: new Set(live.map(r => r.room_id)).size, faculty: new Set(live.flatMap(facultyIds)).size };
    max = Math.max(max, cell.sessions);
    return cell;
  }));
  return { cells, max };
}

export interface DayLoad { day: number; sessions: number; hours: number }
export function computeBusiestDay(rows: PublishedSession[]): { busiest: DayLoad | null; byDay: DayLoad[] } {
  const byDay = DAYS.map((d, day): DayLoad => {
    const list = rows.filter(r => r.day === d);
    return { day, sessions: list.length, hours: list.reduce((n, r) => n + (minutes(r.end_time) - minutes(r.start_time)) / 60, 0) };
  });
  const top = byDay.reduce((a, b) => (b.hours > a.hours ? b : a), byDay[0]);
  return { busiest: top && top.hours > 0 ? top : null, byDay };
}

export interface Peak { start: number; end: number; total: number; perDay: number }
/** The 15-minute window with the most sessions running, summed over the week. First one wins ties. */
export function computePeak(rows: PublishedSession[]): Peak | null {
  const bins = new Array((DAY_END - DAY_START) / 15).fill(0) as number[];
  for (const r of rows) {
    const s = minutes(r.start_time), e = minutes(r.end_time);
    bins.forEach((_, i) => { const lo = DAY_START + i * 15; if (s < lo + 15 && e > lo) bins[i]++; });
  }
  const top = Math.max(0, ...bins);
  if (!top) return null;
  const first = bins.indexOf(top);
  let last = first;
  while (bins[last + 1] === top) last++;
  const days = new Set(rows.map(r => r.day)).size || 1;
  return { start: DAY_START + first * 15, end: DAY_START + (last + 1) * 15, total: top, perDay: top / days };
}

/* ───────────────────────── insights ───────────────────────── */

export type Tab = "overview" | "faculty" | "classes" | "rooms";
export interface Insight { id: string; severity: Severity; icon: IconKey; text: string; detail: string; target?: { tab: Tab; id?: string } }

const shortName = (f: { id: string; name: string }) => (f.name.length <= 18 ? f.name : f.id);

/** One insight per person, room or section: its worst flag up front, the rest counted and listed in the tooltip. */
function entityInsight(id: string, who: string, flags: Flag[], target: Insight["target"], title?: string): Insight | null {
  if (!flags.length) return null;
  const sorted = [...flags].sort((a, b) => bySeverityDesc(a.severity, b.severity));
  const top = sorted[0];
  return {
    id, severity: top.severity, icon: top.icon, target,
    text: `${who}: ${top.label}${sorted.length > 1 ? ` +${sorted.length - 1}` : ""}`,
    detail: [title, ...sorted.map(f => `${f.label}: ${f.detail}`)].filter(Boolean).join("\n"),
  };
}

export function buildInsights(a: { faculty: FacultyStat[]; fairness: number | null; classes: ClassCard[]; rooms: RoomStat[] }): Insight[] {
  const flagged = [
    ...a.faculty.map(f => entityInsight(`f:${f.id}`, shortName(f), f.flags, { tab: "faculty", id: f.id }, f.name)),
    ...a.rooms.map(r => entityInsight(`r:${r.id}`, r.id, r.flags, { tab: "rooms", id: r.id }, r.name !== r.id ? r.name : undefined)),
    ...a.classes.map(c => entityInsight(`c:${c.key}`, `Sem ${c.semester} ${c.section}`, c.flags, { tab: "classes", id: c.key })),
  ].filter((i): i is Insight => i !== null);
  if (a.fairness !== null && a.fairness < LIMITS.fairnessOk)
    flagged.push({ id: "fair", severity: a.fairness < LIMITS.fairnessWatch ? "problem" : "watch", icon: "gauge", text: `Workload uneven · ${a.fairness.toFixed(2)}`, detail: `Jain's fairness index over weekly teaching hours is ${a.fairness.toFixed(2)}. 1.00 means everyone teaches the same amount.`, target: { tab: "faculty" } });
  flagged.sort((x, y) => bySeverityDesc(x.severity, y.severity));

  const oks: Insight[] = [];
  if (a.fairness !== null && a.fairness >= LIMITS.fairnessOk) oks.push({ id: "ok:fair", severity: "ok", icon: "check", text: "Workload evenly spread", detail: `Jain's fairness index over weekly teaching hours is ${a.fairness.toFixed(2)} (healthy from ${LIMITS.fairnessOk}).`, target: { tab: "faculty" } });
  if (a.rooms.length && !a.rooms.some(r => r.flags.length)) oks.push({ id: "ok:rooms", severity: "ok", icon: "check", text: "Rooms in a healthy range", detail: `Every room sits between ${pct(LIMITS.roomLow)} and ${pct(LIMITS.roomHigh)} booked.`, target: { tab: "rooms" } });
  if (a.classes.length && !a.classes.some(c => c.flags.length)) oks.push({ id: "ok:classes", severity: "ok", icon: "check", text: "Class days balanced", detail: "No heavy days or long free gaps in any section.", target: { tab: "classes" } });
  const clashes = a.faculty.reduce((n, f) => n + f.profile.clashes, 0) + a.rooms.reduce((n, r) => n + r.profile.clashes, 0);
  if (!clashes) oks.push({ id: "ok:clash", severity: "ok", icon: "check", text: "No clashes found", detail: "No faculty member or room is booked twice at the same time." });
  return [...flagged, ...oks];
}

/* ───────────────────────── everything at once ───────────────────────── */

export interface Filters { semester: string; section: string }
export const ALL = "all";

export function filterRows(rows: PublishedSession[], f: Filters): PublishedSession[] {
  return rows.filter(r => (f.semester === ALL || r.semester === f.semester) && (f.section === ALL || r.section === f.section));
}

export interface DeptStats {
  rows: PublishedSession[];
  faculty: ReturnType<typeof computeFaculty>;
  classes: ClassCard[];
  rooms: RoomStat[];
  roomUse: number | null;
  heat: ReturnType<typeof computeHeat>;
  busiest: ReturnType<typeof computeBusiestDay>;
  peak: Peak | null;
  insights: Insight[];
  attention: { count: number; severity: Severity };
}

/** Filters apply to teaching views. Rooms are shared across semesters, so they always cover the whole department. */
export function computeDeptStats(all: PublishedSession[], filters: Filters, resources: CsvResource[] = []): DeptStats {
  const rows = filterRows(all, filters);
  const faculty = computeFaculty(rows);
  const classes = computeClasses(rows);
  const rooms = computeRooms(all, resources);
  const roomUse = rooms.length ? rooms.reduce((n, r) => n + r.usedHours, 0) / (rooms.length * WEEK_ROOM_HOURS) : null;
  const insights = buildInsights({ faculty: faculty.list, fairness: faculty.fairness, classes, rooms });
  const flagged = insights.filter(i => i.severity !== "ok");
  return { rows, faculty, classes, rooms, roomUse, heat: computeHeat(rows), busiest: computeBusiestDay(rows), peak: computePeak(rows), insights, attention: { count: flagged.length, severity: worst(flagged) } };
}

export function filterOptions(all: PublishedSession[]) {
  return {
    semesters: [...new Set(all.map(r => r.semester))].sort((a, b) => Number(a) - Number(b)),
    sections: [...new Set(all.map(r => r.section))].sort(),
  };
}

/* ───────────────────────── CSV export ───────────────────────── */

/** Quotes a cell and neutralises spreadsheet formulas, since names and codes come from an uploaded CSV. */
export function csvCell(v: string | number): string {
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s) && Number.isNaN(Number(s))) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
export const toCsv = (table: (string | number)[][]) => table.map(r => r.map(csvCell).join(",")).join("\r\n") + "\r\n";

export function exportTable(tab: Tab, s: DeptStats): (string | number)[][] {
  const r1 = (n: number) => Math.round(n * 10) / 10;
  if (tab === "faculty")
    return [["faculty_id", "name", "hours_per_week", "vs_dept_avg_pct", "morning_hours", "afternoon_hours", "longest_stretch_hours", "days_teaching", "flags"],
      ...s.faculty.list.map(f => [f.id, f.name, r1(f.hours), Math.round(f.dev * 100), r1(f.profile.morningMin / 60), r1(f.profile.afternoonMin / 60), r1((f.profile.longest?.teaching || 0) / 60), f.profile.daysActive, f.flags.map(x => x.label).join("; ")])];
  if (tab === "classes")
    return [["semester", "section", "group", "hours_per_week", "busiest_day", "busiest_day_hours", "free_gap_hours", "flags"],
      ...s.classes.flatMap(c => c.units.map(u => {
        const hrs = u.profile.dayMinutes.map(m => m / 60), top = Math.max(...hrs);
        return [c.semester, c.section, u.label, r1(u.profile.hours), top ? DAYS[hrs.indexOf(top)] : "", r1(top), r1(u.profile.gapMinutes / 60), u.flags.map(x => x.label).join("; ")];
      }))];
  if (tab === "rooms")
    return [["room_id", "type", "type_inferred", "hours_used", "available_hours", "utilization_pct", "sessions", "flags"],
      ...s.rooms.map(r => [r.id, r.type, r.inferred ? "yes" : "no", r1(r.usedHours), WEEK_ROOM_HOURS, Math.round(r.util * 1000) / 10, r.sessions, r.flags.map(x => x.label).join("; ")])];
  return [["day", "hour_start", "sessions_running", "rooms_in_use", "faculty_teaching"],
    ...s.heat.cells.flat().map(c => [DAYS[c.day], clock(c.hour * 60), c.sessions, c.rooms, c.faculty])];
}
