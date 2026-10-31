"use client";

import React, { useEffect, useState } from "react";
import type { Teacher, TeacherAvailability, PeriodSlotTemplate } from "@/lib/types/timetable";
import { Users, Plus, CheckCircle2, AlertCircle, X, ShieldAlert, Sparkles, Clock, Lock } from "lucide-react";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const FALLBACK_PERIODS = [
  "09:00-10:00",
  "10:15-11:15",
  "11:15-12:15",
  "13:00-14:00",
  "14:00-15:00",
  "15:00-16:00",
  "16:00-17:00",
];

export default function TeachersPage() {
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [availability, setAvailability] = useState<TeacherAvailability[]>([]);
  const [selectedTeacherId, setSelectedTeacherId] = useState<string>("");
  const [periods, setPeriods] = useState<string[]>(FALLBACK_PERIODS);
  const [showAddModal, setShowAddModal] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const [newTeacher, setNewTeacher] = useState({
    faculty_id: "",
    name: "",
    department_id: "dept-cse",
    designation: "Assistant Professor",
    max_weekly_hours: 10, // Max 10 blocks policy
    max_daily_hours: 2,   // Max 2 blocks policy
  });

  const loadData = async () => {
    try {
      const res = await fetch("/api/timetable-maker/data");
      if (res.ok) {
        const data = await res.json();
        setTeachers(data.teachers || []);
        setAvailability(data.teacherAvailability || []);
        if (data.teachers && data.teachers.length > 0 && !selectedTeacherId) {
          setSelectedTeacherId(data.teachers[0].faculty_id);
        }

        // Dynamically extract instructional class periods from config
        if (data.config?.period_slots && data.config.period_slots.length > 0) {
          const classSlots = (data.config.period_slots as PeriodSlotTemplate[])
            .filter((s) => !s.is_break && !s.is_buffer)
            .map((s) => `${s.start_time}-${s.end_time}`);
          if (classSlots.length > 0) {
            setPeriods(classSlots);
          }
        }
      }
    } catch {
      setMsg({ text: "Failed to load teachers", ok: false });
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const selectedTeacher = teachers.find(
    (t) => t.faculty_id === selectedTeacherId || t.id === selectedTeacherId
  );

  // Quota counts for selected teacher
  const selectedTeacherBlocks = availability.filter(
    (a) =>
      (a.teacher_id === selectedTeacherId || a.teacher_id === selectedTeacher?.id) &&
      a.availability_type === "unavailable"
  );
  const totalWeeklyBlocks = selectedTeacherBlocks.length;
  const getDayBlockedCount = (day: string) =>
    selectedTeacherBlocks.filter((a) => a.day_of_week === day).length;

  const isUnavailable = (day: string, periodStr: string) => {
    const [start] = periodStr.split("-");
    return availability.some(
      (a) =>
        (a.teacher_id === selectedTeacherId || a.teacher_id === selectedTeacher?.id) &&
        a.day_of_week === day &&
        a.start_time.startsWith(start) &&
        a.availability_type === "unavailable"
    );
  };

  const toggleAvailability = async (day: string, periodStr: string) => {
    if (!selectedTeacherId) return;
    const [start, end] = periodStr.split("-");
    const currentlyUnavailable = isUnavailable(day, periodStr);

    let updated = [...availability];
    if (currentlyUnavailable) {
      // Unblocking slot is always allowed
      updated = updated.filter(
        (a) =>
          !(
            (a.teacher_id === selectedTeacherId || a.teacher_id === selectedTeacher?.id) &&
            a.day_of_week === day &&
            a.start_time.startsWith(start)
          )
      );
    } else {
      // 1. Enforce Day Limit: max 2 blocks per day
      const dayCount = getDayBlockedCount(day);
      if (dayCount >= 2) {
        setMsg({
          text: `Policy Limit: Faculty can only use/block up to 2 periods on ${day}.`,
          ok: false,
        });
        setTimeout(() => setMsg(null), 4000);
        return;
      }

      // 2. Enforce Week Limit: max 10 blocks in whole week
      if (totalWeeklyBlocks >= 10) {
        setMsg({
          text: `Policy Limit: Faculty can only use/block up to 10 periods across the entire week.`,
          ok: false,
        });
        setTimeout(() => setMsg(null), 4000);
        return;
      }

      updated.push({
        id: `avail-${Date.now()}`,
        teacher_id: selectedTeacherId,
        day_of_week: day as any,
        start_time: `${start}:00`,
        end_time: `${end}:00`,
        availability_type: "unavailable",
      });
    }

    setAvailability(updated);

    try {
      await fetch("/api/timetable-maker/data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "set_availability",
          payload: { records: updated },
        }),
      });
      setMsg({ text: "Availability matrix updated successfully", ok: true });
      setTimeout(() => setMsg(null), 3000);
    } catch {
      setMsg({ text: "Failed to save availability", ok: false });
    }
  };

  const handleAddTeacher = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch("/api/timetable-maker/data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "add_teacher",
          payload: {
            ...newTeacher,
            max_weekly_hours: Number(newTeacher.max_weekly_hours) || 10,
            max_daily_hours: Number(newTeacher.max_daily_hours) || 2,
            is_active: true,
          },
        }),
      });
      if (res.ok) {
        setMsg({ text: `Faculty member ${newTeacher.name} added!`, ok: true });
        setShowAddModal(false);
        loadData();
      }
    } catch {
      setMsg({ text: "Failed to add teacher", ok: false });
    }
  };

  return (
    <div>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2.5">
            <Users className="w-5 h-5 text-teal-400" />
            <span>Faculty Directory & Weekly Availability Matrix</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Configure individual teaching workloads and blocked periods. Policy limit: Max 10 blocks/week, max 2 blocks/day.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 bg-gradient-to-r from-teal-400 to-emerald-400 text-[#06231F] font-bold text-xs px-4 py-2.5 rounded-lg shadow-md shadow-teal-500/20 hover:brightness-110 transition-all"
        >
          <Plus className="w-4 h-4" />
          <span>Add Faculty Member</span>
        </button>
      </div>

      {msg && (
        <div
          className={`flex items-center gap-2 p-3 mb-4 rounded-lg text-xs font-medium border ${
            msg.ok ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-300" : "bg-rose-500/10 border-rose-500/20 text-rose-300"
          }`}
        >
          {msg.ok ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <AlertCircle className="w-4 h-4 text-rose-400" />}
          <span>{msg.text}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left: Faculty List */}
        <div className="card p-4 border border-[#26324A] bg-[#121B2E] rounded-xl shadow-lg h-fit">
          <div className="flex items-center justify-between pb-3 mb-3 border-b border-[#26324A]">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 m-0">Faculty Directory</h3>
            <span className="text-[11px] text-teal-400 font-semibold">{teachers.length} Instructors</span>
          </div>

          <div className="space-y-1.5 max-h-[520px] overflow-y-auto pr-1">
            {teachers.map((t) => {
              const isSelected = t.faculty_id === selectedTeacherId || t.id === selectedTeacherId;
              const teacherBlocks = availability.filter(
                (a) =>
                  (a.teacher_id === t.faculty_id || a.teacher_id === t.id) &&
                  a.availability_type === "unavailable"
              ).length;

              return (
                <div
                  key={t.id}
                  onClick={() => setSelectedTeacherId(t.faculty_id)}
                  className={`p-3 rounded-lg cursor-pointer transition-all border ${
                    isSelected
                      ? "bg-teal-500/15 border-teal-500/40 shadow-sm"
                      : "bg-[#17233A]/60 border-[#26324A] hover:border-slate-500 hover:bg-[#17233A]"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <b className={`text-xs font-semibold ${isSelected ? "text-teal-300" : "text-slate-200"}`}>
                      {t.name}
                    </b>
                    <span className="font-mono text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded border border-slate-700">
                      {t.faculty_id}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-slate-400 mt-1">
                    <span>{t.designation}</span>
                    <span className="text-teal-300 font-medium">
                      {teacherBlocks}/10 blocks blocked
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: Availability Matrix */}
        <div className="card lg:col-span-2 p-5 border border-[#26324A] bg-[#121B2E] rounded-xl shadow-lg">
          {selectedTeacher ? (
            <div>
              <div className="flex flex-wrap items-center justify-between gap-3 pb-3 mb-3 border-b border-[#26324A]">
                <div>
                  <h3 className="text-sm font-bold text-white normal-case m-0">
                    Weekly Calendar Matrix for <span className="text-teal-400">{selectedTeacher.name}</span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Click any slot to toggle between <span className="text-emerald-400 font-semibold">Available</span> and <span className="text-rose-400 font-semibold">Unavailable (Blocked)</span>.
                  </p>
                </div>

                <div className="flex items-center gap-3 text-xs">
                  <span className="flex items-center gap-1.5 text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-md border border-emerald-500/20 font-semibold text-[11px]">
                    <span className="w-2 h-2 rounded-full bg-emerald-400" /> Available
                  </span>
                  <span className="flex items-center gap-1.5 text-rose-400 bg-rose-500/10 px-2.5 py-1 rounded-md border border-rose-500/20 font-semibold text-[11px]">
                    <span className="w-2 h-2 rounded-full bg-rose-400" /> Unavailable (Blocked)
                  </span>
                </div>
              </div>

              {/* Policy Quota Bar */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4 p-3 rounded-lg bg-[#17233A] border border-[#26324A]">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-300 font-semibold flex items-center gap-1.5">
                      <ShieldAlert className="w-3.5 h-3.5 text-teal-400" />
                      Weekly Blocked Quota
                    </span>
                    <span
                      className={`font-mono text-xs font-bold ${
                        totalWeeklyBlocks >= 10
                          ? "text-rose-400"
                          : totalWeeklyBlocks >= 8
                          ? "text-amber-400"
                          : "text-emerald-400"
                      }`}
                    >
                      {totalWeeklyBlocks} / 10 used {totalWeeklyBlocks >= 10 ? "(Max Reached)" : ""}
                    </span>
                  </div>
                  <div className="w-full bg-slate-900 h-2 rounded-full overflow-hidden border border-[#26324A]">
                    <div
                      className={`h-full transition-all duration-300 ${
                        totalWeeklyBlocks >= 10
                          ? "bg-rose-500"
                          : totalWeeklyBlocks >= 8
                          ? "bg-amber-500"
                          : "bg-emerald-500"
                      }`}
                      style={{ width: `${Math.min(100, (totalWeeklyBlocks / 10) * 100)}%` }}
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-3 text-xs">
                  <span className="text-slate-400 text-[11px]">Daily Limit Rule:</span>
                  <span className="font-semibold text-teal-300 bg-slate-900 px-2.5 py-1 rounded border border-[#26324A] font-mono text-xs">
                    Max 2 blocks / day
                  </span>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full border-separate border-spacing-1.5 min-w-[550px]">
                  <thead>
                    <tr>
                      <th className="w-28 text-center bg-[#17233A] text-slate-400 rounded-md py-2 px-2 text-[11px] font-bold uppercase border border-[#26324A]">
                        Period
                      </th>
                      {DAYS.map((day) => {
                        const dayCount = getDayBlockedCount(day);
                        const isDayMax = dayCount >= 2;
                        return (
                          <th
                            key={day}
                            className={`text-center rounded-md py-2 px-2 border transition-colors ${
                              isDayMax
                                ? "bg-amber-950/20 border-amber-500/40 text-amber-300"
                                : "bg-[#17233A] border-[#26324A] text-slate-300"
                            }`}
                          >
                            <div className="text-[11px] font-bold uppercase">{day}</div>
                            <span
                              className={`inline-block text-[10px] font-mono px-1.5 py-0.2 rounded mt-0.5 ${
                                isDayMax
                                  ? "bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30"
                                  : "text-slate-400 bg-slate-800"
                              }`}
                            >
                              {dayCount}/2
                            </span>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {periods.map((period) => (
                      <tr key={period}>
                        <td className="text-center py-2 px-2 bg-[#17233A] rounded-md border border-[#26324A] font-mono text-[11px] text-slate-400 font-semibold">
                          {period}
                        </td>
                        {DAYS.map((day) => {
                          const blocked = isUnavailable(day, period);
                          const dayCount = getDayBlockedCount(day);
                          const isDayMax = !blocked && dayCount >= 2;
                          const isWeekMax = !blocked && totalWeeklyBlocks >= 10;
                          const isDisabled = isDayMax || isWeekMax;

                          return (
                            <td
                              key={day}
                              onClick={() => toggleAvailability(day, period)}
                              title={
                                blocked
                                  ? "Click to free this slot"
                                  : isDayMax
                                  ? "Daily limit (2/2) reached for this day"
                                  : isWeekMax
                                  ? "Weekly limit (10/10) reached for this faculty"
                                  : "Click to block this slot"
                              }
                              className={`text-center py-2 px-2 rounded-md font-bold text-[11px] cursor-pointer select-none transition-all duration-150 border ${
                                blocked
                                  ? "bg-rose-500/20 text-rose-300 border-rose-500/40 hover:bg-rose-500/30"
                                  : isDisabled
                                  ? "bg-slate-900/40 text-slate-600 border-[#26324A]/40 cursor-not-allowed hover:border-rose-500/40"
                                  : "bg-emerald-500/10 text-emerald-400 border-emerald-500/25 hover:bg-emerald-500/20"
                              }`}
                            >
                              {blocked ? (
                                "BLOCKED"
                              ) : isDisabled ? (
                                <span className="flex items-center justify-center gap-1 opacity-70">
                                  <Lock className="w-2.5 h-2.5" /> FREE
                                </span>
                              ) : (
                                "FREE"
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="py-20 text-center text-slate-400 text-xs">
              Select an instructor from the left list to review or adjust their weekly availability matrix.
            </div>
          )}
        </div>
      </div>

      {/* Add Teacher Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="card w-full max-w-md p-6 bg-[#121B2E] border border-teal-500/30 rounded-2xl shadow-2xl">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-[#26324A]">
              <h3 className="text-base font-bold text-white flex items-center gap-2 m-0">
                <Users className="w-4 h-4 text-teal-400" />
                <span>Add Faculty Member</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-[#17233A] bg-transparent shadow-none"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddTeacher} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-300">Faculty ID</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. F028"
                    value={newTeacher.faculty_id}
                    onChange={(e) => setNewTeacher({ ...newTeacher, faculty_id: e.target.value })}
                    className="w-full bg-[#17233A] border border-[#26324A] text-slate-200 text-xs rounded-lg px-3 py-2"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-300">Max Weekly Hours (Blocks)</label>
                  <input
                    type="number"
                    value={newTeacher.max_weekly_hours}
                    onChange={(e) => setNewTeacher({ ...newTeacher, max_weekly_hours: Number(e.target.value) })}
                    className="w-full bg-[#17233A] border border-[#26324A] text-slate-200 text-xs rounded-lg px-3 py-2"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-300">Full Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Dr. Ramesh Kumar"
                  value={newTeacher.name}
                  onChange={(e) => setNewTeacher({ ...newTeacher, name: e.target.value })}
                  className="w-full bg-[#17233A] border border-[#26324A] text-slate-200 text-xs rounded-lg px-3 py-2"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-300">Designation</label>
                  <input
                    type="text"
                    value={newTeacher.designation}
                    onChange={(e) => setNewTeacher({ ...newTeacher, designation: e.target.value })}
                    className="w-full bg-[#17233A] border border-[#26324A] text-slate-200 text-xs rounded-lg px-3 py-2"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-300">Max Daily Hours</label>
                  <input
                    type="number"
                    value={newTeacher.max_daily_hours}
                    onChange={(e) => setNewTeacher({ ...newTeacher, max_daily_hours: Number(e.target.value) })}
                    className="w-full bg-[#17233A] border border-[#26324A] text-slate-200 text-xs rounded-lg px-3 py-2"
                  />
                </div>
              </div>

              <div className="p-2.5 rounded-lg bg-teal-500/10 border border-teal-500/20 text-[11px] text-teal-300">
                💡 Policy rule: Faculty can use/block up to 10 blocks in the whole week and at most 2 blocks per day.
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-[#26324A]">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 text-xs font-semibold bg-transparent hover:bg-[#17233A] text-slate-300 border border-[#26324A] rounded-lg shadow-none"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold bg-[#4FD1C5] hover:bg-teal-300 text-[#06231F] rounded-lg shadow-sm"
                >
                  Save Faculty
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
