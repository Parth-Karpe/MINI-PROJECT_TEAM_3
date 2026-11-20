"use client";

import { DAYS, minutes, validatePublication, type PublishedSession } from "@/lib/publishedTimetable";
import { DAY, dayMs, ms, ymd } from "@/lib/time";

const names = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const label = (n: number) => `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
const statusLabels = { completed: "Completed", running: "In progress", upcoming: "Upcoming" };

export function timetableStatus(row: PublishedSession, clock: string, occurrenceDate?: string) {
  const today = dayMs(clock.slice(0, 10));
  const weekday = new Date(today).getUTCDay();
  const monday = today - ((weekday + 6) % 7) * DAY;
  const date = row._one_off_date || occurrenceDate || ymd(monday + DAYS.indexOf(row.day) * DAY);
  const now = ms(clock);
  if (now >= ms(`${date}T${row.end_time}`)) return "completed";
  if (now >= ms(`${date}T${row.start_time}`)) return "running";
  return "upcoming";
}

function shortCourse(row: PublishedSession) {
  const words = row.course_name.match(/[A-Za-z0-9]+/g) || [];
  if (words.length === 1) return words[0];
  return words.filter(word => !/^(and|for|of|the|lab)$/i.test(word)).map(word => word[0].toUpperCase()).join("") || row.course_code;
}

export function WeeklyTimetable({ rows, visibleDay, clock, occurrenceDate, compact = false }: {
  rows: PublishedSession[];
  visibleDay?: string;
  clock?: string;
  occurrenceDate?: string;
  compact?: boolean;
}) {
  if (!rows.length) return <p className="rd-empty">{visibleDay ? "No sessions on this date." : "No matching sessions."}</p>;
  const groups = [...new Set(rows.map(row => `${row.semester}:${row.section}`))].sort();
  const findings = validatePublication(rows);

  return <>
    {clock && <ul className="weekly-legend" aria-label="Class status">
      {Object.entries(statusLabels).map(([status, text]) =>
        <li key={status} className={`weekly-${status}`}>{text}</li>)}
    </ul>}
    {groups.map(group => {
      const [semester, section] = group.split(":");
      const sessions = rows.filter(row => row.semester === semester && row.section === section);
      const bounds = [...new Set([
        480, 540, 600, 615, 675, 735, 750, 810, 870, 930, 945, 1005, 1020,
        ...sessions.flatMap(row => [minutes(row.start_time), minutes(row.end_time)]),
      ])].sort((a, b) => a - b);
      return <div className="weekly-sheet" key={group}>
        <h3>CSE (AI) · Semester {semester} · Division {section}</h3>
        <div className="rd-table-wrap" tabIndex={0} aria-label="Scroll timetable">
          <table className={`weekly-grid${compact ? " weekly-compact" : ""}`}>
            <thead><tr><th scope="col">Day / Time</th>{bounds.slice(0, -1).map((bound, i) =>
              <th key={bound} scope="col">{label(bound)}<br />{label(bounds[i + 1])}</th>
            )}</tr></thead>
            {DAYS.map((day, index) => {
              if (visibleDay && day !== visibleDay) return null;
              const dayRows = sessions.filter(row => row.day === day).sort((a, b) => minutes(a.start_time) - minutes(b.start_time));
              const lanes: PublishedSession[][] = [];
              for (const row of dayRows) {
                const lane = lanes.find(items => minutes(items[items.length - 1].end_time) <= minutes(row.start_time));
                if (lane) lane.push(row);
                else lanes.push([row]);
              }
              if (!lanes.length) lanes.push([]);
              return <tbody key={day}>{lanes.map((lane, laneIndex) => {
                const cells: React.ReactNode[] = [];
                for (let i = 0; i < bounds.length - 1;) {
                  const row = lane.find(item => minutes(item.start_time) === bounds[i]);
                  if (!row) {
                    const bound = bounds[i];
                    const lunch = bound >= 750 && bound < 810;
                    const pause = lunch || (bound >= 600 && bound < 615) || (bound >= 930 && bound < 945);
                    cells.push(<td key={i} className={pause ? "weekly-break" : "weekly-free"}>{pause && !laneIndex ? (lunch ? "Lunch" : "Break") : ""}</td>);
                    i++;
                    continue;
                  }
                  const end = bounds.indexOf(minutes(row.end_time));
                  const status = clock ? timetableStatus(row, clock, occurrenceDate) : undefined;
                  const conflict = findings.some(finding => finding.split(":")[0].split(" (")[0].split(" / ").includes(row.entry_id));
                  const details = <>
                    {row.faculty_name || row.faculty_id} · {row.room_id}<br />
                    {row.batch || "Whole section"}{row.session_type && ` · ${row.session_type}`}<br />
                    {row.start_time}–{row.end_time}
                    {conflict && <><br />Schedule conflict</>}
                  </>;
                  cells.push(<td key={i} colSpan={end - i} className={[
                    "weekly-session", status && `weekly-${status}`, conflict && "weekly-conflict",
                  ].filter(Boolean).join(" ")}>
                    {compact ? <details>
                      <summary aria-label={`${row.course_name || row.course_code}, ${row.room_id}${status ? ", " + statusLabels[status] : ""}`}>
                        <strong>{shortCourse(row)}</strong>
                        <span>{row.room_id}{row.batch && ` · ${row.batch}`}</span>
                      </summary>
                      <small><strong>{row.course_name || row.course_code}</strong><br />{details}</small>
                    </details> : <>
                      <strong>{row.course_code}</strong><div>{row.course_name}</div>
                      <small>{details}{status && <><br />{statusLabels[status]}</>}</small>
                    </>}
                  </td>);
                  i = end;
                }
                return <tr key={laneIndex}>{laneIndex === 0 && <th scope="rowgroup" rowSpan={lanes.length}>{names[index]}</th>}{cells}</tr>;
              })}</tbody>;
            })}
          </table>
        </div>
      </div>;
    })}
  </>;
}
