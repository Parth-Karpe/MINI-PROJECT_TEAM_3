"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiGet, apiPost } from "@/lib/apiClient";
import { esc } from "@/lib/time";
import type { AnalysisReport, EngineState, TimetableState } from "@/lib/types";

interface TimetableProps {
  initialTimetable: TimetableState;
  initialAnalyzed: AnalysisReport | null;
  initialState: EngineState;
}

interface RefFile {
  name: string;
  text: string;
}

const TT_TEMPLATE =
  "entry_id,day,start_time,end_time,branch,semester,section,course_code,course_name,session_type,faculty_id,faculty_name,room_id,expected_students\nE001,Mon,09:00,10:00,CSE,3,A,CSE3-DS,Data Structures,theory,F001,Dr. Rao,CS-CLASSROOM-101,60\n";

function download(name: string, text: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "text/csv" }));
  a.download = name;
  a.click();
}

export function Timetable({ initialTimetable, initialAnalyzed, initialState }: TimetableProps) {
  const [timetable, setTimetable] = useState<TimetableState>(initialTimetable);
  const [analyzed, setAnalyzed] = useState<AnalysisReport | null>(initialAnalyzed);
  const [state, setState] = useState<EngineState>(initialState);
  const [msg, setMsg] = useState<{ text: string; kind: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ttFileRef = useRef<HTMLInputElement | null>(null);
  const refFilesRef = useRef<HTMLInputElement | null>(null);
  const ttFile = useRef<{ name: string; text: string } | null>(null);
  const refFiles = useRef<RefFile[]>([]);

  const [fnWeek, setFnWeek] = useState("");
  const [fnWeeks, setFnWeeks] = useState("16");
  const [fnActor, setFnActor] = useState("");
  const [fnRole, setFnRole] = useState("hod");
  const [ttQuery, setTtQuery] = useState("");

  const say = (text: string, kind = "ok") => setMsg({ text, kind });

  const refresh = useCallback(async () => {
    try {
      const tt = await apiGet<TimetableState>("/api/timetable");
      setTimetable(tt);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load timetable");
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const onAnalyze = async () => {
    const file = ttFile.current;
    if (!file) return;
    try {
      say("Analyzing…");
      const r = await apiPost<AnalysisReport>("/api/timetable/analyze", { csv_text: file.text });
      setAnalyzed(r);
      say(`${r.flaw_count} finding(s) across ${r.entries_analyzed} sessions. Nothing was changed.`, r.clean ? "ok" : "err");
    } catch (e) {
      say(e instanceof Error ? e.message : "Analysis failed", "err");
    }
  };

  const onFinalize = async () => {
    const file = ttFile.current;
    if (!file) {
      say("Upload a timetable CSV first.", "err");
      return;
    }
    if (!fnWeek) {
      say("Pick the Monday to start from.", "err");
      return;
    }
    const needsAnalyzeConfirm = !!analyzed && !analyzed.clean;
    if (!analyzed) {
      if (!window.confirm("You haven't analyzed this timetable yet. Finalize anyway?")) return;
    } else if (needsAnalyzeConfirm && !window.confirm("The analysis found hard conflicts. Conflicting classes will be rejected in every week. Finalize anyway?")) {
      return;
    }
    try {
      const r = await apiPost<Record<string, unknown>>("/api/timetable/finalize", {
        csv_text: file.text,
        actor_id: fnActor || "hod_cse",
        actor_role: fnRole || "hod",
        week_start: `${fnWeek}T00:00:00`,
        weeks: Number(fnWeeks) || 16,
      });
      say(
        `Finalized: ${r.confirmed} occurrences confirmed, ${Array.isArray(r.rejected) ? r.rejected.length : 0} rejected${
          r.replaced_occurrences ? `, replaced ${r.replaced_occurrences} from the previous timetable` : ""
        }.`,
        Array.isArray(r.rejected) && r.rejected.length ? "err" : "ok"
      );
      refresh();
    } catch (e) {
      say(e instanceof Error ? e.message : "Finalize failed", "err");
    }
  };

  const ttStatus = timetable.finalized
    ? `Finalized: ${timetable.template_row_count} classes/week, ${timetable.horizon ? `${timetable.horizon.start.slice(0, 10)} → ${timetable.horizon.end.slice(0, 10)} (${timetable.horizon.weeks} weeks)` : ""}`
    : "Not finalized yet.";

  const filtered = timetable.entries.filter((e) => {
    const q = ttQuery.toLowerCase();
    if (!q) return true;
    return Object.values(e)
      .join(" ")
      .toLowerCase()
      .includes(q);
  });

  return (
    <>
      {error ? <div className="error-box">{error}</div> : null}
      <div className="grid">
        <div className="card">
          <h3>1 · Upload timetable CSV</h3>
          <label
            className="drop"
            htmlFor="tt-file-input"
            onDragOver={(e) => e.preventDefault()}
            onDragEnter={(e) => e.preventDefault()}
            onDragLeave={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files?.[0];
              if (f) f.text().then((text) => (ttFile.current = { name: f.name, text }));
            }}
          >
            <input
              id="tt-file-input"
              ref={ttFileRef}
              type="file"
              accept=".csv,text/csv,text/plain"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) f.text().then((text) => (ttFile.current = { name: f.name, text }));
                e.target.value = "";
              }}
            />
            <b>Choose a CSV file</b> or drop it here
            <span>one branch or the whole college</span>
            <span className="fn">{ttFile.current?.name ?? ""}</span>
          </label>
          <div className="bar" style={{ margin: 12 }}>
            <button className="sec" id="tt-tpl" onClick={() => download("timetable_template.csv", TT_TEMPLATE)}>
              Download template
            </button>
          </div>
          <details style={{ marginTop: 12 }}>
            <summary className="msg">Optional: import sections / faculty / courses reference files</summary>
            <label
              className="drop"
              style={{ marginTop: 8 }}
              htmlFor="ref-file-input"
              onDragOver={(e) => e.preventDefault()}
              onDragEnter={(e) => e.preventDefault()}
              onDragLeave={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                void (async () => {
                  const files = Array.from(e.dataTransfer.files ?? []);
                  refFiles.current = await Promise.all(files.map(async (f) => ({ name: f.name, text: await f.text() })));
                })();
              }}
            >
              <input
                id="ref-file-input"
                ref={refFilesRef}
                type="file"
                accept=".csv,text/csv"
                multiple
                hidden
                onChange={async (e) => {
                  const files = Array.from(e.target.files ?? []);
                  refFiles.current = await Promise.all(files.map(async (f) => ({ name: f.name, text: await f.text() })));
                  e.target.value = "";
                }}
              />
              <b>Choose up to 3 files</b> (type is auto-detected)
              <span className="fn">{refFiles.current.map((f) => f.name).join(", ")}</span>
            </label>
            <div className="msg" id="ref-msg"></div>
          </details>
        </div>
        <div className="card">
          <h3>2 · Analyze (changes nothing)</h3>
          <p className="msg" style={{ marginTop: 0 }}>
            Finds double-booked rooms, faculty and sections, over-capacity rooms, impossible travel gaps and lopsided weeks.
          </p>
          <button id="an-go" disabled={!ttFile} onClick={onAnalyze}>
            Analyze timetable
          </button>
          <div className="msg" id="an-msg">{msg?.text ?? ""}</div>
        </div>
        <div className="card">
          <h3>3 · Finalize</h3>
          <div className="f">
            <div className="r2">
              <div>
                <label>Starts Monday of week</label>
                <input type="date" id="fn-week" value={fnWeek} onChange={(e) => setFnWeek(e.target.value)} />
              </div>
              <div>
                <label>Weeks</label>
                <input type="number" id="fn-weeks" value={fnWeeks} min={1} max={52} onChange={(e) => setFnWeeks(e.target.value)} />
              </div>
            </div>
            <div className="r2">
              <div>
                <label>Your HOD ID</label>
                <input id="fn-actor" placeholder="hod_cse" value={fnActor} onChange={(e) => setFnActor(e.target.value)} />
              </div>
              <div>
                <label>Role</label>
                <input id="fn-role" placeholder="hod" value={fnRole} onChange={(e) => setFnRole(e.target.value)} />
              </div>
            </div>
            <div>
              <button id="fn-go" disabled={!ttFile} onClick={onFinalize}>
                Finalize as default timetable
              </button>
            </div>
          </div>
          <p className="msg">Finalizing again replaces the previous default timetable.</p>
          <div className="msg" id="fn-msg">{msg?.text ?? ""}</div>
        </div>
      </div>
      {analyzed ? (
        <div className="card" id="an-card">
          <h3>Analysis</h3>
          <p style={{ marginTop: 0 }}>
            <b style={{ color: `var(--${analyzed.clean ? "ok" : "bad"})` }}>{analyzed.summary}</b>
          </p>
          {analyzed.flaws.length ? (
            analyzed.flaws.map((f) => (
              <div className="flaw" key={`${f.kind}-${f.entries.join("-")}`}>
                <span className="tag">{f.severity}</span>
                {f.message}
                {f.suggestion ? (
                  <div className="sg">
                    → {f.suggestion}
                  </div>
                ) : null}
              </div>
            ))
          ) : (
            <div className="empty">No findings.</div>
          )}
        </div>
      ) : null}
      <div className="card">
        <h3>Current default timetable</h3>
        <div className="bar">
          <div>
            <label>Filter</label>
            <input id="t-q" placeholder="section, course, faculty, room…" value={ttQuery} onChange={(e) => setTtQuery(e.target.value)} />
          </div>
        </div>
        <div className="scroll" id="t-table">
          {filtered.length ? (
            <table>
              <tbody>
                <tr>
                  <th>Day</th>
                  <th>Time</th>
                  <th>Section</th>
                  <th>Course</th>
                  <th>Faculty</th>
                  <th>Room</th>
                </tr>
                {filtered.slice(0, 300).map((e) => (
                  <tr key={e.entry_id}>
                    <td>{esc(e.day)}</td>
                    <td className="mono">
                      {esc(e.start_time)}–{esc(e.end_time)}
                    </td>
                    <td>{esc(e.section_id)}</td>
                    <td>{esc(e.course_code)}</td>
                    <td>{esc(e.faculty_name)}</td>
                    <td className="mono">{esc(e.resource_id)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="empty">Nothing finalized yet.</div>
          )}
        </div>
      </div>
    </>
  );
}
