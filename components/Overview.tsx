"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { apiGet, apiPost } from "@/lib/apiClient";
import { iso, nowWall, todayMs } from "@/lib/time";
import type { AnalysisReport, EngineState, TimetableState } from "@/lib/types";

interface OverviewProps {
  initialState: EngineState;
  initialTimetable: TimetableState;
  initialAnalyzed: AnalysisReport | null;
}

export function Overview({ initialState, initialTimetable, initialAnalyzed }: OverviewProps) {
  const [state, setState] = useState<EngineState>(initialState);
  const [timetable, setTimetable] = useState<TimetableState>(initialTimetable);
  const [analyzed, setAnalyzed] = useState<AnalysisReport | null>(initialAnalyzed);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const now = nowWall();
    const t = todayMs();
    const a = t;
    const b = t + 864e5;
    try {
      await apiPost("/api/admin/resolve", { now });
    } catch {
      /* engine may be unreachable -- keep showing whatever we have */
    }
    try {
      const st = await apiGet<EngineState>(
        `/api/admin/state?window_start=${iso(a)}&window_end=${iso(b)}&now=${now}`
      );
      setState(st);
      setError(null);
      const tt = await apiGet<TimetableState>("/api/timetable");
      setTimetable(tt);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load engine state");
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(() => {
      const tag = (document.activeElement as { tagName?: string } | null)?.tagName;
      if (!document.hidden && tag !== "INPUT" && tag !== "SELECT" && tag !== "TEXTAREA") {
        refresh();
      }
    }, 5000);
    return () => clearInterval(id);
  }, [refresh]);

  const ttNow = state.accepted.filter((a) => a.is_timetable).length;
  const adhoc = state.accepted.length - ttNow;
  const stats: Array<[number | string, string]> = [
    [state.resources.length, "resources"],
    [timetable.finalized ? timetable.template_row_count : "—", "classes / week"],
    [ttNow, "classes today"],
    [adhoc, "ad hoc today"],
    [state.pending.length, "pending"],
    [state.rejected.length, "rejected / waitlisted"],
  ];

  const steps: Array<[boolean, string, string, string]> = [
    [state.resources.length > 0, "Add your resources", "Import rooms.csv or add them one by one", "/resources"],
    [!!analyzed || timetable.finalized, "Upload and analyze the timetable", "Catch conflicts and overloaded days before publishing", "/timetable"],
    [timetable.finalized, "Finalize the default timetable", "Locks it in for the semester", "/timetable"],
    [timetable.finalized, "Check the schedule", "See every room hour by hour", "/schedule"],
  ];

  return (
    <>
      {error ? <div className="error-box">{error}</div> : null}
      <div className="stats">
        {stats.map(([n, l]) => (
          <div className="stat" key={l}>
            <b>{n}</b>
            <span>{l}</span>
          </div>
        ))}
      </div>
      <div className="card">
        <h3>Getting started</h3>
        <div className="steps">
          {steps.map(([done, a, b, h], i) => (
            <Link key={h} href={h} className={`step ${done ? "done" : ""}`}>
              <i>{done ? "✓" : i + 1}</i>
              <div>
                <b>{a}</b>
                <div className="msg" style={{ margin: 0 }}>
                  {b}
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </>
  );
}
