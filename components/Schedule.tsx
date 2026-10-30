"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { apiGet, apiPost } from "@/lib/apiClient";
import { DAY, dayMs, hm, iso, ms, todayMs, ymd } from "@/lib/time";
import type { EngineState, TimetableState } from "@/lib/types";

interface ScheduleProps {
  initialState: EngineState;
  initialTimetable: TimetableState;
}

interface GanttItem {
  s: number;
  e: number;
  cls: string;
  l1: string;
  l2: string;
  tip: string;
  cancel?: string;
  lane?: number;
}

interface GanttRow {
  d0: number;
  l1: string;
  l2: string;
  items: GanttItem[];
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function Schedule({ initialState, initialTimetable }: ScheduleProps) {
  const [state, setState] = useState<EngineState>(initialState);
  const [timetable, setTimetable] = useState<TimetableState>(initialTimetable);
  const [ttMap, setTtMap] = useState<Record<string, Record<string, string | undefined>>>({});
  const [mode, setMode] = useState<"day" | "week">("day");
  const [date, setDate] = useState<string>(ymd(todayMs()));
  const [type, setType] = useState("");
  const [q, setQ] = useState("");
  const [resId, setResId] = useState("");
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const t = todayMs();
    const a = t;
    const b = t + 864e5;
    try {
      const st = await apiGet<EngineState>(`/api/admin/state?window_start=${iso(a)}&window_end=${iso(b)}&now=${new Date().toISOString()}`);
      setState(st);
      const tt = await apiGet<TimetableState>("/api/timetable");
      setTimetable(tt);
      const map: Record<string, Record<string, string | undefined>> = {};
      for (const e of tt.entries) {
        map[e.entry_id] = {
          course_code: e.course_code,
          section_id: e.section_id,
          course_name: e.course_name,
          faculty_name: e.faculty_name,
          day: e.day,
          start_time: e.start_time,
          end_time: e.end_time,
        };
      }
      setTtMap(map);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load schedule");
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const itemsFor = (rid: string): GanttItem[] => {
    const out: GanttItem[] = [];
    for (const a of state.accepted) {
      if (a.resource_id !== rid) continue;
      const s = ms(a.start);
      const e = ms(a.end);
      const m = a.is_timetable ? ttMap[a.request_id.split("#")[0]] : undefined;
      if (m) {
        out.push({
          s,
          e,
          cls: "tt",
          l1: m.course_code ?? "",
          l2: m.section_id ?? "",
          tip: `${m.course_name ?? ""} (${m.course_code ?? ""})\n${m.section_id ?? ""} · ${m.faculty_name ?? ""}\n${m.day ?? ""} ${m.start_time ?? ""}–${m.end_time ?? ""} · ${rid}`,
        });
      } else {
        out.push({
          s,
          e,
          cls: "ok",
          l1: a.request_id,
          l2: a.user_id,
          cancel: a.is_timetable ? "" : a.request_id,
          tip: `${a.request_id} by ${a.user_id}\n${hm(s)}–${hm(e)} · ${rid}`,
        });
      }
    }
    for (const p of state.pending) {
      if (p.resource_id !== rid) continue;
      const s = ms(p.start);
      const e = ms(p.end);
      out.push({ s, e, cls: "pend", l1: `${p.request_id} (pending)`, l2: p.user_id, tip: `Pending ${p.request_id} by ${p.user_id}` });
    }
    return out;
  };

  const rows = useMemo<GanttRow[]>(() => {
    if (state.resources.length === 0) return [];
    const week = mode === "week";
    const d = dayMs(date || ymd(todayMs()));
    const out: GanttRow[] = [];
    if (week) {
      const rid = resId || state.resources[0].resource_id;
      const mon = d - ((new Date(d).getUTCDay() + 6) % 7) * DAY;
      const all = itemsFor(rid);
      for (let i = 0; i < 6; i++) {
        const d0 = mon + i * DAY;
        out.push({ d0, l1: new Date(d0).toUTCString().slice(0, 11), l2: rid, items: all.filter((x) => x.s >= d0 && x.s < d0 + DAY) });
      }
    } else {
      const list = state.resources
        .filter((r) => (!type || r.resource_type === type) && (!q || (r.resource_id + (r.name ?? "")).toLowerCase().includes(q)))
        .sort((a, b) => a.resource_id.localeCompare(b.resource_id));
      for (const r of list) {
        out.push({ d0: d, l1: r.resource_id, l2: `${r.resource_type} · cap ${r.capacity}`, items: itemsFor(r.resource_id).filter((x) => x.s >= d && x.s < d + DAY) });
      }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, mode, date, type, q, resId]);

  const AX: [number, number] = useMemo(() => {
    let lo = 8;
    let hi = 17;
    for (const r of rows) {
      for (const it of r.items) {
        lo = Math.min(lo, Math.floor((it.s - r.d0) / 36e5));
        hi = Math.max(hi, Math.ceil((it.e - r.d0) / 36e5));
      }
    }
    lo = Math.max(0, lo);
    hi = Math.min(24, hi);
    return [lo, hi] as [number, number];
  }, [rows]);

  const onCancel = async (id: string) => {
    if (!window.confirm(`Cancel booking ${id}?`)) return;
    try {
      await apiPost("/api/cancel", { request_id: id, now: new Date().toISOString() });
      await refresh();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Cancel failed");
    }
  };

  const gantt = (rows: GanttRow[]): ReactNode => {
    const lo = AX[0];
    const hi = AX[1];
    const n = hi - lo;
    const now = new Date();
    const nowMs = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes());
    const axisCells = Array.from({ length: n }, (_, i) => <span key={i}>{pad(lo + i)}:00</span>);
    const rowEls: React.ReactNode[] = [];
    for (const r of rows) {
      const lanes: number[] = [];
      const sorted = [...r.items].sort((a, b) => a.s - b.s);
      for (const it of sorted) {
        let l = lanes.findIndex((x) => x <= it.s);
        if (l < 0) {
          l = lanes.length;
          lanes.push(0);
        }
        lanes[l] = it.e;
        it.lane = l;
      }
      const H = Math.max(1, lanes.length) * 38 + 6;
      const blocks = sorted.map((it) => (
        <div
          key={`${it.l1}-${it.s}-${it.e}`}
          className={`gb ${it.cls}`}
          style={{
            left: `${((it.s - r.d0) / 36e5 - lo) / n * 100}%`,
            width: `${((it.e - it.s) / 36e5) / n * 100}%`,
            top: `${3 + (it.lane ?? 0) * 38}px`,
          }}
          title={it.tip}
        >
          <b>{it.l1}</b>
          <i>
            {hm(it.s)}–{hm(it.e)}
          </i>
          {it.cancel ? (
            <button onClick={() => onCancel(it.cancel as string)}>✕</button>
          ) : null}
        </div>
      ));
      const nl = nowMs >= r.d0 && nowMs < r.d0 + DAY && (nowMs - r.d0) / 36e5 >= lo && (nowMs - r.d0) / 36e5 < hi ? (
        <div className="now" style={{ left: `${((nowMs - r.d0) / 36e5 - lo) / n * 100}%` }} />
      ) : null;
      rowEls.push(
        <div className="g-row" key={r.l1}>
          <div className="g-lab">
            <b>{r.l1}</b>
            <small>{r.l2}</small>
          </div>
          <div className="g-tr" style={{ height: H }}>
            {nl}
            {blocks}
          </div>
        </div>
      );
    }
    return (
      <div className="gw">
        <div className="g" style={{ "--n": n } as CSSProperties}>
          <div className="g-h">
            <div />
            <div className="g-ax">{axisCells}</div>
          </div>
          {rowEls}
        </div>
      </div>
    );
  };

  if (state.resources.length === 0) {
    return <div className="empty">No resources yet — import them on the Resources page.</div>;
  }

  const rangeLabel = rows.length
    ? mode === "week"
      ? `From ${new Date(rows[0].d0).toUTCString().slice(0, 16)} to ${new Date(rows[5].d0).toUTCString().slice(0, 16)} · ${pad(AX[0])}:00 → ${pad(AX[1])}:00`
      : `${new Date(date || ymd(todayMs())).toUTCString().slice(0, 16)} · ${pad(AX[0])}:00 → ${pad(AX[1])}:00`
    : "";

  const shift = (n: number) => {
    const d = dayMs(date) + n * (mode === "week" ? 7 : 1) * DAY;
    setDate(ymd(d));
  };

  return (
    <>
      {error ? <div className="error-box">{error}</div> : null}
      <div className="card">
        <div className="bar">
          <div>
            <label>View</label>
            <select value={mode} onChange={(e) => setMode(e.target.value as "day" | "week")}>
              <option value="day">All resources · one day</option>
              <option value="week">One resource · whole week</option>
            </select>
          </div>
          <div>
            <label>Date</label>
            <div style={{ display: "flex", gap: 4 }}>
              <button className="sec" onClick={() => shift(-1)}>
                ◀
              </button>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              <button className="sec" onClick={() => shift(1)}>
                ▶
              </button>
              <button
                className="sec"
                onClick={() => {
                  setDate(ymd(todayMs()));
                }}
              >
                Today
              </button>
            </div>
          </div>
          {mode === "day" ? (
            <>
              <div>
                <label>Type</label>
                <select value={type} onChange={(e) => setType(e.target.value)}>
                  <option value="">All types</option>
                  {[...new Set(state.resources.map((r) => r.resource_type).filter(Boolean))].sort().map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label>Search</label>
                <input placeholder="room…" value={q} onChange={(e) => setQ(e.target.value)} />
              </div>
            </>
          ) : (
            <div>
              <label>Resource</label>
              <select value={resId} onChange={(e) => setResId(e.target.value)}>
                {state.resources.map((r) => (
                  <option key={r.resource_id} value={r.resource_id}>
                    {r.resource_id}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
        <div style={{ fontSize: 15, margin: "2px 0 10px" }}>{rangeLabel}</div>
        {rows.length ? (
          gantt(rows)
        ) : (
          <div className="empty">No resources match.</div>
        )}
        <div className="legend">
          <span>
            <i style={{ background: "var(--ac)" }} />
            Default timetable
          </span>
          <span>
            <i style={{ background: "var(--ok)" }} />
            Ad hoc, confirmed
          </span>
          <span>
            <i style={{ background: "var(--warn)" }} />
            Pending
          </span>
        </div>
      </div>
    </>
  );
}
