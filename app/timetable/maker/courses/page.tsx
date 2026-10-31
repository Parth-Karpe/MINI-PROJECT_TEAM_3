"use client";

import React, { useEffect, useState } from "react";
import type { Course, Teacher } from "@/lib/types/timetable";
import { calculateWeeklyTeachingHours } from "@/lib/ltp";
import { BookOpen, Plus, Trash2, Edit2, Clock, Calculator, X, CheckCircle2, AlertCircle } from "lucide-react";

export default function CoursesPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingCourse, setEditingCourse] = useState<Course | null>(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const initialForm = {
    course_code: "",
    course_name: "",
    department_id: "dept-cse",
    semester: 3,
    academic_year: "2026-2027",
    credits: 4.0,
    lecture_count: 3,
    tutorial_count: 1,
    practical_count: 0,
    lecture_duration: 1.0,
    tutorial_duration: 1.0,
    practical_duration: 2.0, // 1 of P = 2 hrs by default
    required_room_type: "classroom",
    required_lab_specialization: "",
    assigned_teachers: [] as string[],
  };

  const [formData, setFormData] = useState(initialForm);

  const loadData = async () => {
    try {
      const res = await fetch("/api/timetable-maker/data");
      if (res.ok) {
        const data = await res.json();
        setCourses(data.courses || []);
        setTeachers(data.teachers || []);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const calculatedHours = calculateWeeklyTeachingHours({
    lecture_count: Number(formData.lecture_count),
    lecture_duration: Number(formData.lecture_duration),
    tutorial_count: Number(formData.tutorial_count),
    tutorial_duration: Number(formData.tutorial_duration),
    practical_count: Number(formData.practical_count),
    practical_duration: Number(formData.practical_duration),
  });

  const openAddModal = () => {
    setEditingCourse(null);
    setFormData(initialForm);
    setShowModal(true);
  };

  const openEditModal = (c: Course) => {
    setEditingCourse(c);
    setFormData({
      course_code: c.course_code,
      course_name: c.course_name,
      department_id: c.department_id,
      semester: c.semester,
      academic_year: c.academic_year || "2026-2027",
      credits: c.credits,
      lecture_count: c.lecture_count,
      tutorial_count: c.tutorial_count,
      practical_count: c.practical_count,
      lecture_duration: c.lecture_duration || 1.0,
      tutorial_duration: c.tutorial_duration || 1.0,
      practical_duration: c.practical_duration || 2.0,
      required_room_type: c.required_room_type || "classroom",
      required_lab_specialization: c.required_lab_specialization || "",
      assigned_teachers: c.assigned_teachers || [],
    });
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const action = editingCourse ? "update_course" : "add_course";
      const payload = {
        ...(editingCourse ? { id: editingCourse.id } : {}),
        ...formData,
        credits: Number(formData.credits),
        lecture_count: Number(formData.lecture_count),
        tutorial_count: Number(formData.tutorial_count),
        practical_count: Number(formData.practical_count),
        lecture_duration: Number(formData.lecture_duration),
        tutorial_duration: Number(formData.tutorial_duration),
        practical_duration: Number(formData.practical_duration),
        total_weekly_hours: calculatedHours,
      };

      const res = await fetch("/api/timetable-maker/data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, payload }),
      });

      if (res.ok) {
        setMsg({
          text: editingCourse
            ? `Course ${formData.course_code} updated successfully!`
            : `Course ${formData.course_code} added successfully!`,
          ok: true,
        });
        setShowModal(false);
        loadData();
      } else {
        setMsg({ text: "Failed to save course", ok: false });
      }
    } catch {
      setMsg({ text: "Error submitting course", ok: false });
    }
  };

  const handleDelete = async (id: string, code: string) => {
    if (!window.confirm(`Delete course ${code}?`)) return;
    try {
      const res = await fetch("/api/timetable-maker/data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete_course", payload: { id } }),
      });
      if (res.ok) {
        setMsg({ text: `Course ${code} deleted`, ok: true });
        loadData();
      }
    } catch {
      setMsg({ text: "Delete failed", ok: false });
    }
  };

  return (
    <div>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2.5">
            <BookOpen className="w-5 h-5 text-teal-400" />
            <span>Course Catalog & L-T-P Specifications</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Configure contact requirements: Lectures (L: 1h), Tutorials (T: 1h), and Practicals (P: 2h). Edit courses anytime.
          </p>
        </div>
        <button
          type="button"
          onClick={openAddModal}
          className="flex items-center gap-2 bg-gradient-to-r from-teal-400 to-emerald-400 text-[#06231F] font-bold text-xs px-4 py-2.5 rounded-lg shadow-md shadow-teal-500/20 hover:brightness-110 transition-all"
        >
          <Plus className="w-4 h-4" />
          <span>Add New Course</span>
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

      {/* Table Card */}
      <div className="card p-0 overflow-hidden border border-[#26324A] bg-[#121B2E] rounded-xl shadow-lg">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-[#26324A] bg-[#17233A]/70 text-[11px] font-bold uppercase tracking-wider text-slate-400">
              <th className="py-3 px-4">Course Code</th>
              <th className="py-3 px-4">Course Name</th>
              <th className="py-3 px-3">Sem</th>
              <th className="py-3 px-3">Credits</th>
              <th className="py-3 px-4">L-T-P Breakdown</th>
              <th className="py-3 px-4">Durations</th>
              <th className="py-3 px-4">Weekly Hours</th>
              <th className="py-3 px-3">Room Type</th>
              <th className="py-3 px-4">Assigned Faculty</th>
              <th className="py-3 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#26324A]/60 text-xs">
            {loading ? (
              <tr>
                <td colSpan={10} className="text-center py-10 text-slate-400">
                  Loading courses catalog…
                </td>
              </tr>
            ) : courses.length === 0 ? (
              <tr>
                <td colSpan={10} className="text-center py-10 text-slate-400">
                  No courses added yet. Click &quot;+ Add New Course&quot; above.
                </td>
              </tr>
            ) : (
              courses.map((c) => (
                <tr key={c.id} className="hover:bg-[#17233A]/40 transition-colors">
                  <td className="py-3 px-4 font-mono font-bold text-teal-400">{c.course_code}</td>
                  <td className="py-3 px-4 font-medium text-slate-200">{c.course_name}</td>
                  <td className="py-3 px-3 text-slate-400">Sem {c.semester}</td>
                  <td className="py-3 px-3">
                    <span className="inline-block text-[10px] font-semibold bg-slate-800 text-slate-300 border border-slate-700 px-2 py-0.5 rounded">
                      {c.credits} Cr
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <span className="font-mono font-semibold text-slate-200 bg-[#17233A] px-2 py-1 rounded border border-[#26324A]">
                      {c.lecture_count}-{c.tutorial_count}-{c.practical_count}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-slate-400 text-[11px] font-mono">
                    L:{c.lecture_duration || 1}h | T:{c.tutorial_duration || 1}h | P:{c.practical_duration || 2}h
                  </td>
                  <td className="py-3 px-4">
                    <span className="inline-flex items-center gap-1 font-bold text-teal-300">
                      <Clock className="w-3 h-3 text-teal-400" />
                      <span>{c.total_weekly_hours} hrs/wk</span>
                    </span>
                  </td>
                  <td className="py-3 px-3">
                    <span
                      className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded border ${
                        c.required_room_type === "lab"
                          ? "bg-amber-500/10 text-amber-300 border-amber-500/20"
                          : "bg-teal-500/10 text-teal-300 border-teal-500/20"
                      }`}
                    >
                      {c.required_room_type}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-slate-300">
                    {c.assigned_teachers && c.assigned_teachers.length > 0 ? (
                      c.assigned_teachers
                        .map((fid) => {
                          const t = teachers.find((tc) => tc.faculty_id === fid || tc.id === fid);
                          return t ? t.name : fid;
                        })
                        .join(", ")
                    ) : (
                      <span className="text-slate-500 italic">Unassigned</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => openEditModal(c)}
                        className="p-1.5 text-slate-400 hover:text-teal-400 hover:bg-teal-500/10 rounded transition-colors"
                        title="Edit Course"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(c.id, c.course_code)}
                        className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded transition-colors"
                        title="Delete Course"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Add / Edit Course Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="card w-full max-w-lg p-6 bg-[#121B2E] border border-teal-500/30 rounded-2xl shadow-2xl overflow-y-auto max-h-[90vh]">
            <div className="flex items-center justify-between pb-4 mb-4 border-b border-[#26324A]">
              <h3 className="text-base font-bold text-white flex items-center gap-2 m-0">
                <Calculator className="w-4 h-4 text-teal-400" />
                <span>{editingCourse ? "Edit Course Details" : "Configure Course L-T-P Requirements"}</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="text-slate-400 hover:text-slate-200 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="text-xs text-slate-300">Course ID / Code (cid)</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. CSAI5-DL"
                    value={formData.course_code}
                    onChange={(e) => setFormData({ ...formData, course_code: e.target.value.toUpperCase() })}
                    className="w-full bg-[#17233A] border border-[#26324A] text-slate-200 text-xs rounded-lg px-3 py-2 font-mono uppercase focus:border-teal-400"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-300">Credits</label>
                  <input
                    type="number"
                    step="0.5"
                    min="1"
                    max="10"
                    required
                    value={formData.credits}
                    onChange={(e) => setFormData({ ...formData, credits: Number(e.target.value) })}
                    className="w-full bg-[#17233A] border border-[#26324A] text-slate-200 text-xs rounded-lg px-3 py-2 focus:border-teal-400"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-300">Course Title (cname)</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Deep Learning Fundamentals"
                  value={formData.course_name}
                  onChange={(e) => setFormData({ ...formData, course_name: e.target.value })}
                  className="w-full bg-[#17233A] border border-[#26324A] text-slate-200 text-xs rounded-lg px-3 py-2 focus:border-teal-400"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-300">Semester</label>
                  <select
                    value={formData.semester}
                    onChange={(e) => setFormData({ ...formData, semester: Number(e.target.value) })}
                    className="w-full bg-[#17233A] border border-[#26324A] text-slate-200 text-xs rounded-lg px-3 py-2 focus:border-teal-400"
                  >
                    {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => (
                      <option key={s} value={s}>Semester {s}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-300">Department</label>
                  <select
                    value={formData.department_id}
                    onChange={(e) => setFormData({ ...formData, department_id: e.target.value })}
                    className="w-full bg-[#17233A] border border-[#26324A] text-slate-200 text-xs rounded-lg px-3 py-2 focus:border-teal-400"
                  >
                    <option value="dept-cse">Computer Science & Engineering</option>
                    <option value="dept-csai">CSE (AI & ML)</option>
                    <option value="dept-ece">Electronics & Communication</option>
                    <option value="dept-rob">Robotics & Automation</option>
                  </select>
                </div>
              </div>

              {/* L-T-P Spec Box */}
              <div className="p-3.5 bg-[#17233A]/80 border border-[#26324A] rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-teal-400 block">L-T-P Weekly Frequency & Session Lengths</span>
                  <span className="text-[10px] text-amber-300 bg-amber-400/10 px-2 py-0.5 rounded border border-amber-400/20">
                    1 of P = 2.0 hrs
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-[11px] text-slate-300">Lectures (L/wk)</label>
                    <input
                      type="number"
                      min="0"
                      max="10"
                      value={formData.lecture_count}
                      onChange={(e) => setFormData({ ...formData, lecture_count: Number(e.target.value) })}
                      className="w-full bg-[#121B2E] border border-[#26324A] text-slate-200 text-xs rounded-md px-2.5 py-1.5 focus:border-teal-400"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-300">Tutorials (T/wk)</label>
                    <input
                      type="number"
                      min="0"
                      max="5"
                      value={formData.tutorial_count}
                      onChange={(e) => setFormData({ ...formData, tutorial_count: Number(e.target.value) })}
                      className="w-full bg-[#121B2E] border border-[#26324A] text-slate-200 text-xs rounded-md px-2.5 py-1.5 focus:border-teal-400"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-300">Practicals (P/wk)</label>
                    <input
                      type="number"
                      min="0"
                      max="5"
                      value={formData.practical_count}
                      onChange={(e) => setFormData({ ...formData, practical_count: Number(e.target.value) })}
                      className="w-full bg-[#121B2E] border border-[#26324A] text-slate-200 text-xs rounded-md px-2.5 py-1.5 focus:border-teal-400"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-[11px] text-slate-300">Lecture Duration</label>
                    <select
                      value={formData.lecture_duration}
                      onChange={(e) => setFormData({ ...formData, lecture_duration: Number(e.target.value) })}
                      className="w-full bg-[#121B2E] border border-[#26324A] text-slate-200 text-xs rounded-md px-2.5 py-1.5 focus:border-teal-400"
                    >
                      <option value="1.0">1.0 Hour</option>
                      <option value="1.5">1.5 Hours</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-300">Tutorial Duration</label>
                    <select
                      value={formData.tutorial_duration}
                      onChange={(e) => setFormData({ ...formData, tutorial_duration: Number(e.target.value) })}
                      className="w-full bg-[#121B2E] border border-[#26324A] text-slate-200 text-xs rounded-md px-2.5 py-1.5 focus:border-teal-400"
                    >
                      <option value="1.0">1.0 Hour</option>
                      <option value="1.5">1.5 Hours</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-300">Practical Duration</label>
                    <select
                      value={formData.practical_duration}
                      onChange={(e) => setFormData({ ...formData, practical_duration: Number(e.target.value) })}
                      className="w-full bg-[#121B2E] border border-[#26324A] text-slate-200 text-xs rounded-md px-2.5 py-1.5 focus:border-teal-400"
                    >
                      <option value="2.0">2.0 Hours (Standard)</option>
                      <option value="3.0">3.0 Hours</option>
                    </select>
                  </div>
                </div>

                {/* Calculation breakdown */}
                <div className="pt-2 border-t border-[#26324A]/70 flex items-center justify-between text-xs">
                  <span className="text-slate-400 font-mono text-[11px]">
                    ({formData.lecture_count} × {formData.lecture_duration}h) + ({formData.tutorial_count} × {formData.tutorial_duration}h) + ({formData.practical_count} × {formData.practical_duration}h)
                  </span>
                  <span className="font-bold text-teal-300 bg-teal-500/10 px-2 py-0.5 rounded border border-teal-500/20">
                    = {calculatedHours} Weekly Teaching Hours
                  </span>
                </div>
              </div>

              {/* Room & Teacher Assignment */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-300">Required Room Type</label>
                  <select
                    value={formData.required_room_type}
                    onChange={(e) => setFormData({ ...formData, required_room_type: e.target.value })}
                    className="w-full bg-[#17233A] border border-[#26324A] text-slate-200 text-xs rounded-lg px-3 py-2 focus:border-teal-400"
                  >
                    <option value="classroom">Classroom</option>
                    <option value="lab">Computer / Hardware Lab</option>
                    <option value="seminar_hall">Seminar Hall</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-300">Lab Specialization</label>
                  <input
                    type="text"
                    placeholder="e.g. AI/ML GPU, DSA, Electronics"
                    value={formData.required_lab_specialization}
                    onChange={(e) => setFormData({ ...formData, required_lab_specialization: e.target.value })}
                    className="w-full bg-[#17233A] border border-[#26324A] text-slate-200 text-xs rounded-lg px-3 py-2 focus:border-teal-400"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-300">Assigned Teacher</label>
                <select
                  value={formData.assigned_teachers[0] || ""}
                  onChange={(e) => setFormData({ ...formData, assigned_teachers: e.target.value ? [e.target.value] : [] })}
                  className="w-full bg-[#17233A] border border-[#26324A] text-slate-200 text-xs rounded-lg px-3 py-2 focus:border-teal-400"
                >
                  <option value="">-- Auto-Assign Available Faculty --</option>
                  {teachers.map((t) => (
                    <option key={t.id} value={t.faculty_id}>
                      {t.name} ({t.faculty_id} - {t.designation})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#26324A]">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-gradient-to-r from-teal-400 to-emerald-400 text-[#06231F] font-bold text-xs px-5 py-2 rounded-lg shadow-md hover:brightness-110 transition-all"
                >
                  {editingCourse ? "Save Changes" : "Create Course"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
