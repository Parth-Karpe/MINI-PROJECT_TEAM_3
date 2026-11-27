"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, CalendarDays, CircleCheck, Clock, Download, TriangleAlert, OctagonAlert } from "lucide-react";
import type { CsvResource, PublishedSession } from "@/lib/publishedTimetable";
import { ALL, DAY_FULL, WEEK_ROOM_HOURS, clock, computeDeptStats, exportTable, filterOptions, fmtHours, toCsv, type Tab } from "@/lib/deptStats";
import { OverviewTab } from "./OverviewTab";
import { FacultyTab } from "./FacultyTab";
import { ClassesTab } from "./ClassesTab";
import { RoomsTab } from "./RoomsTab";
import { Ring, Tabs, TipLayer, tip, type Tone } from "./ui";
import { HodSectionTabs } from "../HodSectionTabs";
import "./stats.css";

interface Loaded { rows: PublishedSession[]; resources: CsvResource[]; approvedAt?: string }

function Kpi({ visual, value, label, note, tipText, tone = "accent" }: { visual: React.ReactNode; value: string; label: string; note?: string; tipText: string; tone?: Tone }) {
  return (
    <div className={`ds-kpi tone-${tone}`} {...tip(tipText)}>
      <div className="ds-kpi-visual">{visual}</div>
      <div><div className="ds-kpi-value">{value}</div><div className="ds-kpi-label">{label}{note && <span> · {note}</span>}</div></div>
    </div>
  );
}

/**
 * Department statistics. On Reports & stats it is the full page with filters, tabs and export.
 * `embedded` is the compact version for the HOD Overview: the KPI strip, `children` (extra charts),
 * then the week-at-a-glance heatmap and the "What to look at" chips, always for the whole department.
 * A chip there opens the matching detail on the full page.
 */
export function DeptStats({ embedded = false, children }: { embedded?: boolean; children?: React.ReactNode } = {}) {
  const root = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>("overview");
  const [semester, setSemester] = useState(ALL), [section, setSection] = useState(ALL);
  const [open, setOpen] = useState<{ tab: Tab; id: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/publication?role=hod", { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Could not load statistics.");
      setData({ rows: body.approved?.rows || [], resources: body.resources || [], approvedAt: body.approved?.approvedAt });
      setError("");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not load statistics."); }
  }, []);
  // The full page accepts ?tab=faculty&id=AK, so a chip on the Overview can open its detail here.
  useEffect(() => {
    if (embedded) return;
    const q = new URLSearchParams(window.location.search);
    const t = q.get("tab") as Tab | null;
    if (t && ["overview", "faculty", "classes", "rooms"].includes(t)) { setTab(t); const id = q.get("id"); if (id) setOpen({ tab: t, id }); }
  }, [embedded]);
  useEffect(() => {
    void load();
    const onVisible = () => { if (document.visibilityState === "visible") void load(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [load]);

  const options = useMemo(() => filterOptions(data?.rows || []), [data]);
  // A refresh can remove the semester or section that was selected.
  const filters = { semester: options.semesters.includes(semester) ? semester : ALL, section: options.sections.includes(section) ? section : ALL };
  const stats = useMemo(() => (data ? computeDeptStats(data.rows, filters, data.resources) : null), [data, filters.semester, filters.section]); // eslint-disable-line react-hooks/exhaustive-deps
  const filtered = filters.semester !== ALL || filters.section !== ALL;
  const onOpen = useCallback((id: string | null) => setOpen(id ? { tab, id } : null), [tab]);

  function pick(target: { tab: Tab; id?: string }) {
    if (embedded) { router.push(`/dashboards/hod/stats?tab=${target.tab}${target.id ? `&id=${encodeURIComponent(target.id)}` : ""}`); return; }
    setTab(target.tab); setOpen(target.id ? { tab: target.tab, id: target.id } : null);
  }
  function changeTab(next: Tab) { setTab(next); setOpen(null); }
  function download() {
    if (!stats) return;
    const url = URL.createObjectURL(new Blob([toCsv(exportTable(tab, stats))], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url; a.download = `dept-stats-${tab}-sem-${filters.semester}-sec-${filters.section}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  const a = stats?.attention;
  const usedRoomHours = stats ? stats.rooms.reduce((n, r) => n + r.usedHours, 0) : 0;
  const fairness = stats?.faculty.fairness ?? null;
  const fairTone: Tone = fairness === null ? "accent" : fairness >= 0.85 ? "accent" : fairness >= 0.7 ? "watch" : "problem";
  const roomTone: Tone = stats?.roomUse == null ? "accent" : stats.roomUse > 0.85 ? "problem" : stats.roomUse < 0.2 ? "watch" : "accent";
  const openFor = (t: Tab) => (open?.tab === t ? open.id : null);

  return (
    <div className={`ds${embedded ? " ds-embedded" : ""}`} ref={root}>
      {embedded ? <div className="ds-embed-head">
        <h2 className="ds-panel-title">Department statistics</h2>
        <span className="ds-muted">Whole department · published timetable, Mon to Sat, 08:00–17:00{data?.approvedAt ? ` · approved ${new Date(data.approvedAt).toLocaleDateString()}` : ""} · <Link href="/dashboards/hod/stats">Full detail in Reports &amp; stats →</Link></span>
      </div> : <header className="ds-head">
        <div>
          <Link href="/dashboards/hod" className="ds-back"><ArrowLeft size={14} />HOD dashboard</Link>
          <h1 className="ds-title">Department stats</h1>
          <p className="ds-lede">CSE (AI) · published timetable, Mon to Sat, 08:00–17:00{data?.approvedAt ? ` · approved ${new Date(data.approvedAt).toLocaleDateString()}` : ""}</p>
        </div>
        <div className="ds-controls">
          <label className="ds-select"><span>Semester</span>
            <select value={filters.semester} onChange={e => { setSemester(e.target.value); setOpen(null); }} disabled={!stats}>
              <option value={ALL}>All</option>{options.semesters.map(s => <option key={s} value={s}>{s}</option>)}
            </select></label>
          <label className="ds-select"><span>Section</span>
            <select value={filters.section} onChange={e => { setSection(e.target.value); setOpen(null); }} disabled={!stats}>
              <option value={ALL}>All</option>{options.sections.map(s => <option key={s} value={s}>{s}</option>)}
            </select></label>
          <button type="button" className="ds-btn" onClick={download} disabled={!stats || !data?.rows.length} {...tip(`Download the ${tab} view as CSV\nUses the current semester and section`)}><Download size={14} />Export</button>
        </div>
      </header>}

      {!embedded && <HodSectionTabs page="stats" />}
      {error && <p role="alert" className="ds-error">{error} <button type="button" className="ds-link" onClick={() => void load()}>Try again</button></p>}
      {!data && !error && <div className="ds-skeleton" aria-busy="true" aria-label="Loading statistics"><span /><span /><span /><span /><span /></div>}
      {data && !data.rows.length && <div className="ds-panel ds-blank"><h2 className="ds-panel-title">No published timetable yet</h2><p className="ds-muted">Statistics appear after you approve and publish a timetable on the HOD dashboard.</p>{embedded ? <p className="ds-muted">Approve a draft in Scheduling → Timetable review to see them here.</p> : <Link href="/dashboards/hod" className="ds-btn">Back to the dashboard</Link>}</div>}

      {stats && data && data.rows.length > 0 && <>
        <section className="ds-kpis" aria-label="Summary">
          <Kpi tone={roomTone} label="Room use" note={filtered ? "whole dept" : undefined} value={stats.roomUse === null ? "–" : `${Math.round(stats.roomUse * 100)}%`}
            tipText={`Room use\n${fmtHours(usedRoomHours)} booked of ${stats.rooms.length * WEEK_ROOM_HOURS} room-hours (${stats.rooms.length} rooms × ${WEEK_ROOM_HOURS} h)\nAlways the whole department, because rooms are shared`}
            visual={<Ring size={52} stroke={6} tone={roomTone} value={stats.roomUse ?? 0} />} />
          <Kpi tone={fairTone} label="Fairness" value={fairness === null ? "–" : fairness.toFixed(2)}
            tipText={fairness === null ? "Fairness\nNeeds at least two faculty with sessions" : `Fairness ${fairness.toFixed(2)}\nJain's index over weekly teaching hours of ${stats.faculty.list.length} faculty\n1.00 is perfectly even`}
            visual={<Ring size={52} stroke={6} tone={fairTone} value={fairness ?? 0} />} />
          <Kpi label="Busiest day" value={stats.busiest.busiest ? ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][stats.busiest.busiest.day] : "–"}
            tipText={stats.busiest.busiest ? `${DAY_FULL[stats.busiest.busiest.day]}\n${stats.busiest.busiest.sessions} sessions · ${fmtHours(stats.busiest.busiest.hours)} of teaching` : "No sessions"}
            visual={<span className="ds-kpi-icon"><CalendarDays size={22} /></span>} />
          <Kpi label="Peak slot" value={stats.peak ? clock(stats.peak.start) : "–"}
            tipText={stats.peak ? `${clock(stats.peak.start)}–${clock(stats.peak.end)}\n${stats.peak.total} sessions running across the week, about ${stats.peak.perDay.toFixed(1)} at once on a teaching day` : "No sessions"}
            visual={<span className="ds-kpi-icon"><Clock size={22} /></span>} />
          <Kpi tone={a && a.count ? (a.severity === "problem" ? "problem" : "watch") : "accent"} label="Needs attention" value={String(a?.count ?? 0)}
            tipText={a?.count ? `${a.count} flagged item${a.count === 1 ? "" : "s"}\nSee the list on the Overview tab` : "Nothing flagged"}
            visual={<span className="ds-kpi-icon">{a?.count ? (a.severity === "problem" ? <OctagonAlert size={22} /> : <TriangleAlert size={22} />) : <CircleCheck size={22} />}</span>} />
        </section>

        {embedded ? <>
          {children}
          <div className="ds-view"><OverviewTab stats={stats} onPick={pick} /></div>
        </> : <>
        <Tabs label="Statistics sections" value={tab} onChange={changeTab} items={[
          { id: "overview", label: "Overview" }, { id: "faculty", label: "Faculty", count: stats.faculty.list.length },
          { id: "classes", label: "Classes", count: stats.classes.length }, { id: "rooms", label: "Rooms", count: stats.rooms.length },
        ]} />
        <div className="ds-view" key={tab} role="tabpanel" aria-labelledby={`ds-tab-tabs-${tab}`}>
          {tab === "overview" && <OverviewTab stats={stats} onPick={pick} />}
          {tab === "faculty" && <FacultyTab stats={stats} openId={openFor("faculty")} onOpen={onOpen} />}
          {tab === "classes" && <ClassesTab stats={stats} openId={openFor("classes")} onOpen={onOpen} />}
          {tab === "rooms" && <RoomsTab stats={stats} openId={openFor("rooms")} onOpen={onOpen} filtered={filtered} />}
        </div>
        </>}
      </>}
      <TipLayer root={root} />
    </div>
  );
}
