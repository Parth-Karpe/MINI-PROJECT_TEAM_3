"use client";

import React, { useState } from "react";
import type { TimetableConfig, TimetableSession, PeriodSlotTemplate } from "@/lib/types/timetable";
import {
  BookOpen,
  FlaskConical,
  Lightbulb,
  Lock,
  Unlock,
  MapPin,
  User,
  Coffee,
  Utensils,
  AlertTriangle,
  Hourglass,
} from "lucide-react";

interface TimetableGridProps {
  sessions: TimetableSession[];
  onSessionMove: (sessionId: string, newDay: string, newStart: string, newEnd: string) => Promise<boolean>;
  onToggleLock: (sessionId: string) => void;
  filterMode: "batch" | "teacher" | "room";
  filterValue: string;
  config?: TimetableConfig | null;
}

const DEFAULT_PERIODS: PeriodSlotTemplate[] = [
  { id: "p1", period_number: 1, label: "1st Class", start_time: "09:00", end_time: "10:00", is_break: false },
  { id: "b1", label: "Morning Break", start_time: "10:00", end_time: "10:15", is_break: true, break_type: "short" },
  { id: "p2", period_number: 2, label: "2nd Class", start_time: "10:15", end_time: "11:15", is_break: false },
  { id: "p3", period_number: 3, label: "3rd Class", start_time: "11:15", end_time: "12:15", is_break: false },
  { id: "lunch", label: "Lunch Break", start_time: "12:15", end_time: "13:00", is_break: true, break_type: "lunch" },
  { id: "p4", period_number: 4, label: "4th Class", start_time: "13:00", end_time: "14:00", is_break: false },
  { id: "p5", period_number: 5, label: "5th Class", start_time: "14:00", end_time: "15:00", is_break: false },
  { id: "p6", period_number: 6, label: "6th Class", start_time: "15:00", end_time: "16:00", is_break: false },
  { id: "p7", period_number: 7, label: "7th Class", start_time: "16:00", end_time: "17:00", is_break: false },
];

const DEFAULT_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export function TimetableGrid({
  sessions,
  onSessionMove,
  onToggleLock,
  filterMode,
  filterValue,
  config,
}: TimetableGridProps) {
  const [draggedSession, setDraggedSession] = useState<TimetableSession | null>(null);
  const [hoveredCell, setHoveredCell] = useState<{ day: string; start: string } | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);

  const days = config?.working_days && config.working_days.length > 0
    ? config.working_days
    : DEFAULT_DAYS;

  const periods = config?.period_slots && config.period_slots.length > 0
    ? config.period_slots
    : DEFAULT_PERIODS;

  // Flexible and case-insensitive filtering for Batch, Faculty, and Room
  const displayedSessions = sessions.filter((s) => {
    if (!filterValue || filterValue.trim() === "") return true;

    if (filterMode === "batch") {
      return s.section_id.toLowerCase() === filterValue.toLowerCase();
    }
    if (filterMode === "teacher") {
      const val = filterValue.toLowerCase().trim();
      const name = (s.teacher_name || "").toLowerCase().trim();
      const id = (s.teacher_id || "").toLowerCase().trim();
      return name === val || id === val || name.includes(val) || val.includes(name);
    }
    if (filterMode === "room") {
      const val = filterValue.toLowerCase().trim();
      const id = (s.room_id || "").toLowerCase().trim();
      const name = (s.room_name || "").toLowerCase().trim();
      return id === val || name === val || id.includes(val);
    }
    return true;
  });

  const getSessionAt = (day: string, startTime: string) => {
    return displayedSessions.find(
      (s) => s.day_of_week === day && s.start_time <= startTime && startTime < s.end_time
    );
  };

  // Computes the accurate end time based on the period slot sequence
  const getTargetEndTime = (periodIndex: number, durationHours: number): string => {
    if (durationHours <= 1.0) {
      return periods[periodIndex]?.end_time || "";
    }
    // For multi-hour (e.g. 2h lab), find the end time of the next consecutive non-break non-buffer period
    let spannedHours = 0;
    for (let i = periodIndex; i < periods.length; i++) {
      const p = periods[i];
      if (!p.is_break && !p.is_buffer) {
        spannedHours += 1;
        if (spannedHours >= Math.round(durationHours)) {
          return p.end_time;
        }
      } else {
        // Lab cannot cross a break or buffer window
        break;
      }
    }
    // Fallback if at the end of the day
    const [h, m] = periods[periodIndex].start_time.split(":").map(Number);
    const endH = h + durationHours;
    return `${String(Math.floor(endH)).padStart(2, "0")}:${String(m || 0).padStart(2, "0")}`;
  };

  const handleDragStart = (e: React.DragEvent, session: TimetableSession) => {
    setDraggedSession(session);
    e.dataTransfer.setData("text/plain", session.id);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent, day: string, start: string, isBlocked: boolean) => {
    e.preventDefault();
    if (isBlocked) {
      e.dataTransfer.dropEffect = "none";
      return;
    }
    e.dataTransfer.dropEffect = "move";
    setHoveredCell({ day, start });
  };

  const handleDrop = async (e: React.DragEvent, day: string, start: string, periodIndex: number) => {
    e.preventDefault();
    setHoveredCell(null);
    if (!draggedSession) return;

    const targetPeriod = periods[periodIndex];
    if (targetPeriod?.is_break || targetPeriod?.is_buffer) {
      setMoveError(`Cannot place session in ${targetPeriod.label || "Break/Buffer"}.`);
      setTimeout(() => setMoveError(null), 4000);
      setDraggedSession(null);
      return;
    }

    const endTimeStr = getTargetEndTime(periodIndex, draggedSession.duration_hours);

    const ok = await onSessionMove(draggedSession.id, day, start, endTimeStr);
    if (!ok) {
      setMoveError(`Cannot place ${draggedSession.course_code} at ${day} ${start}: Collision or break/buffer overlap.`);
      setTimeout(() => setMoveError(null), 4000);
    }
    setDraggedSession(null);
  };

  return (
    <div className="card p-4 overflow-x-auto border border-[#26324A] bg-[#121B2E] rounded-xl shadow-xl">
      {moveError && (
        <div className="flex items-center gap-2 p-3 mb-3 bg-rose-500/10 border border-rose-500/30 text-rose-300 rounded-lg text-xs font-medium animate-pulse">
          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{moveError}</span>
        </div>
      )}

      <table className="w-full min-w-[950px] border-separate border-spacing-1.5">
        <thead>
          <tr>
            <th className="w-32 text-center bg-[#17233A] text-slate-300 rounded-lg py-3 px-2 text-xs font-bold tracking-wider uppercase border border-[#26324A]">
              Period / Slot
            </th>
            {days.map((day) => (
              <th
                key={day}
                className="text-center bg-[#17233A] text-slate-200 rounded-lg py-3 px-4 text-xs font-bold tracking-wider uppercase border border-[#26324A]"
              >
                {day}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {periods.map((period, periodIdx) => {
            // Buffer Time Row
            if (period.is_buffer) {
              return (
                <tr key={period.id}>
                  <td className="text-center py-2 px-2 bg-[#17233A]/60 rounded-md border border-cyan-500/30 text-cyan-300 text-[11px] font-semibold">
                    <div className="flex items-center justify-center gap-1.5">
                      <Hourglass className="w-3.5 h-3.5 text-cyan-400" />
                      <span>{period.label || "Buffer Time"}</span>
                    </div>
                    <span className="text-[10px] text-slate-400 block font-mono mt-0.5">
                      {period.start_time}–{period.end_time}
                    </span>
                  </td>
                  <td
                    colSpan={days.length}
                    className="text-center py-2 px-4 bg-cyan-950/20 border border-dashed border-cyan-500/30 rounded-md text-cyan-300 text-xs tracking-wider uppercase font-medium"
                  >
                    <div className="flex items-center justify-center gap-2">
                      <Hourglass className="w-3.5 h-3.5 text-cyan-400" />
                      <span>
                        {period.label || "Buffer Time"} · Transition Window ({period.start_time} – {period.end_time})
                      </span>
                    </div>
                  </td>
                </tr>
              );
            }

            // Break Slot Row
            if (period.is_break) {
              const BreakIcon = period.break_type === "lunch" ? Utensils : Coffee;
              return (
                <tr key={period.id}>
                  <td className="text-center py-2 px-2 bg-[#17233A]/60 rounded-md border border-[#26324A]/40 text-amber-300/80 text-[11px] font-semibold">
                    <div className="flex items-center justify-center gap-1.5">
                      <BreakIcon className="w-3.5 h-3.5 text-amber-400" />
                      <span>{period.label}</span>
                    </div>
                    <span className="text-[10px] text-slate-500 block font-mono mt-0.5">{period.start_time}–{period.end_time}</span>
                  </td>
                  <td
                    colSpan={days.length}
                    className="text-center py-2 px-4 bg-slate-900/50 border border-dashed border-amber-500/20 rounded-md text-amber-300/70 text-xs tracking-wider uppercase font-medium"
                  >
                    <div className="flex items-center justify-center gap-2">
                      <BreakIcon className="w-3.5 h-3.5 text-amber-400" />
                      <span>{period.label} Window ({period.start_time} – {period.end_time})</span>
                    </div>
                  </td>
                </tr>
              );
            }

            return (
              <tr key={period.id}>
                {/* Period Time Slot Header */}
                <td className="text-center py-2.5 px-2 bg-[#17233A] rounded-lg border border-[#26324A] text-xs">
                  <span className="font-bold text-teal-400 block">{period.label}</span>
                  <span className="text-[10.5px] text-slate-400 font-mono block mt-0.5">
                    {period.start_time}–{period.end_time}
                  </span>
                </td>

                {/* Day Slot Cells */}
                {days.map((day) => {
                  const session = getSessionAt(day, period.start_time);
                  const isHovered = hoveredCell?.day === day && hoveredCell?.start === period.start_time;

                  // If an active session started in an earlier period, skip rendering this cell (handled by rowSpan!)
                  if (session && session.start_time < period.start_time) {
                    return null;
                  }

                  // Determine rowSpan for multi-hour sessions (e.g. 2-hour labs)
                  let rowSpan = 1;
                  if (session && session.duration_hours >= 1.8) {
                    let count = 0;
                    for (let k = periodIdx; k < periods.length; k++) {
                      if (periods[k].start_time < session.end_time && !periods[k].is_break && !periods[k].is_buffer) {
                        count++;
                      }
                    }
                    rowSpan = Math.max(1, count);
                  }

                  const isLab = session?.session_type === "lab";

                  return (
                    <td
                      key={day}
                      rowSpan={rowSpan}
                      onDragOver={(e) => handleDragOver(e, day, period.start_time, !!(period.is_break || period.is_buffer))}
                      onDragLeave={() => setHoveredCell(null)}
                      onDrop={(e) => handleDrop(e, day, period.start_time, periodIdx)}
                      className={`align-top rounded-lg p-1.5 transition-all duration-150 border ${
                        rowSpan >= 2 ? "min-h-[170px]" : "h-20"
                      } ${
                        isHovered
                          ? "bg-teal-500/15 border-teal-400 shadow-inner"
                          : session
                          ? isLab
                            ? "bg-amber-950/20 border-amber-500/40"
                            : "bg-[#17233A]/80 border-[#26324A]"
                          : "bg-[#121B2E]/40 border-[#26324A]/60 hover:border-slate-600"
                      }`}
                    >
                      {session && (
                        <div
                          draggable={!session.is_locked}
                          onDragStart={(e) => handleDragStart(e, session)}
                          className={`group relative flex flex-col justify-between h-full p-2.5 rounded-lg border transition-all text-xs cursor-grab active:cursor-grabbing select-none ${
                            session.is_locked
                              ? "bg-slate-800/80 border-slate-700/80 opacity-90 cursor-not-allowed"
                              : isLab
                              ? "bg-gradient-to-br from-amber-500/15 to-orange-500/10 border-amber-500/40 hover:border-amber-400 shadow-md shadow-amber-950/30"
                              : session.session_type === "tutorial"
                              ? "bg-indigo-500/10 border-indigo-500/30 hover:border-indigo-400 shadow-sm"
                              : "bg-teal-500/10 border-teal-500/30 hover:border-teal-400 shadow-sm"
                          }`}
                        >
                          <div>
                            {/* Course Code & Type Badge */}
                            <div className="flex items-center justify-between gap-1 mb-1.5">
                              <span className="font-mono font-bold text-teal-300 text-xs truncate">
                                {session.course_code}
                              </span>
                              <div className="flex items-center gap-1">
                                <span
                                  className={`text-[9.5px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${
                                    isLab
                                      ? "bg-amber-400/20 text-amber-300 border-amber-400/30 font-mono"
                                      : session.session_type === "tutorial"
                                      ? "bg-indigo-400/20 text-indigo-300 border-indigo-400/30"
                                      : "bg-teal-400/20 text-teal-300 border-teal-400/30"
                                  }`}
                                >
                                  {isLab
                                    ? `Lab (${session.duration_hours}h)`
                                    : session.session_type === "tutorial"
                                    ? "Tut"
                                    : "Theory"}
                                </span>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onToggleLock(session.id);
                                  }}
                                  className="text-slate-400 hover:text-white p-0.5"
                                  title={session.is_locked ? "Unlock Slot" : "Lock Slot"}
                                >
                                  {session.is_locked ? (
                                    <Lock className="w-3 h-3 text-amber-400" />
                                  ) : (
                                    <Unlock className="w-3 h-3 opacity-30 group-hover:opacity-100" />
                                  )}
                                </button>
                              </div>
                            </div>

                            {/* Course Title if multi-row */}
                            {rowSpan >= 2 && session.course_name && (
                              <div className="text-[11px] font-medium text-slate-200 line-clamp-1 mb-1">
                                {session.course_name}
                              </div>
                            )}

                            {/* Time Window Badge for multi-hour labs */}
                            {rowSpan >= 2 && (
                              <div className="inline-block text-[10px] font-mono text-amber-300 bg-amber-500/20 px-2 py-0.5 rounded border border-amber-500/30 mb-2">
                                ⏱ {session.start_time} – {session.end_time} (2 Continuous Hours)
                              </div>
                            )}
                          </div>

                          {/* Teacher & Room footer */}
                          <div className="space-y-1 text-[11px] text-slate-300 pt-1.5 border-t border-[#26324A]/60 mt-auto">
                            {session.teacher_name && (
                              <div className="flex items-center gap-1.5 truncate text-slate-200">
                                <User className="w-3 h-3 text-teal-400 shrink-0" />
                                <span className="truncate font-medium">{session.teacher_name}</span>
                              </div>
                            )}
                            <div className="flex items-center justify-between text-slate-400 text-[10.5px]">
                              <span className="flex items-center gap-1 font-mono text-amber-300/90 font-medium">
                                {isLab ? (
                                  <FlaskConical className="w-3 h-3 text-amber-400 shrink-0" />
                                ) : (
                                  <MapPin className="w-3 h-3 text-teal-400 shrink-0" />
                                )}
                                <span>{session.room_id}</span>
                              </span>
                              <span className="text-[10px] text-slate-400 font-semibold bg-[#17233A] px-1.5 py-0.5 rounded border border-[#26324A]">
                                {session.section_id}
                                {session.group_name ? ` · ${session.group_name}` : ""}
                              </span>
                            </div>
                          </div>
                        </div>
                      )}

                      {!session && isHovered && (
                        <div className="h-full border-2 border-dashed border-teal-400/80 rounded-lg flex items-center justify-center text-xs text-teal-300 font-mono font-bold bg-teal-500/10">
                          Drop Here
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
