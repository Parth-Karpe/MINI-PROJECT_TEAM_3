"use client";

import React, { useEffect, useState } from "react";
import type { Batch, StudentGroup } from "@/lib/types/timetable";
import { Layers, Plus, Scissors, Users, CheckCircle2, AlertCircle, X, RotateCcw } from "lucide-react";

export default function BatchesPage() {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const [newBatch, setNewBatch] = useState({
    section_id: "",
    department_id: "dept-cse",
    semester: 3,
    section_name: "A",
    strength: 65,
    academic_year: "2026-2027",
  });

  const loadData = async () => {
    try {
      const res = await fetch("/api/timetable-maker/data");
      if (res.ok) {
        const data = await res.json();
        setBatches(data.batches || []);
      }
    } catch {
      setMsg({ text: "Failed to load batches", ok: false });
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Strict half-split: if odd, assign the extra student to group 1
  const handleSplitLabGroups = async (batch: Batch) => {
    const group1Strength = Math.ceil(batch.strength / 2);
    const group2Strength = Math.floor(batch.strength / 2);

    const subGroups: StudentGroup[] = [
      {
        id: `g-${batch.id}-1`,
        batch_id: batch.id,
        group_name: `${batch.section_name}1`,
        strength: group1Strength,
      },
      {
        id: `g-${batch.id}-2`,
        batch_id: batch.id,
        group_name: `${batch.section_name}2`,
        strength: group2Strength,
      },
    ];

    try {
      const res = await fetch("/api/timetable-maker/data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_batch",
          payload: { id: batch.id, sub_groups: subGroups },
        }),
      });
      if (res.ok) {
        setMsg({
          text: `Section ${batch.section_id} split strictly 50/50: ${batch.section_name}1 (${group1Strength}) & ${batch.section_name}2 (${group2Strength})`,
          ok: true,
        });
        loadData();
      }
    } catch {
      setMsg({ text: "Failed to split groups", ok: false });
    }
  };

  const handleResetGroups = async (batch: Batch) => {
    try {
      const res = await fetch("/api/timetable-maker/data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_batch",
          payload: { id: batch.id, sub_groups: [] },
        }),
      });
      if (res.ok) {
        setMsg({ text: `Reset Section ${batch.section_id} to unified single group`, ok: true });
        loadData();
      }
    } catch {
      setMsg({ text: "Failed to reset groups", ok: false });
    }
  };

  const handleAddBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch("/api/timetable-maker/data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "add_batch",
          payload: {
            ...newBatch,
            semester: Number(newBatch.semester),
            strength: Number(newBatch.strength),
          },
        }),
      });
      if (res.ok) {
        setMsg({ text: `Section ${newBatch.section_id} added!`, ok: true });
        setShowAddModal(false);
        loadData();
      }
    } catch {
      setMsg({ text: "Failed to add section", ok: false });
    }
  };

  return (
    <div>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2.5">
            <Layers className="w-5 h-5 text-teal-400" />
            <span>Student Batches & Lab Sub-group Management</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Define student cohorts, total headcount, and auto-split sections strictly in half for practical lab sessions.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 bg-gradient-to-r from-teal-400 to-emerald-400 text-[#06231F] font-bold text-xs px-4 py-2.5 rounded-lg shadow-md shadow-teal-500/20 hover:brightness-110 transition-all"
        >
          <Plus className="w-4 h-4" />
          <span>Add Section</span>
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

      {/* Batches Table */}
      <div className="card p-0 overflow-hidden border border-[#26324A] bg-[#121B2E] rounded-xl shadow-lg">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-[#26324A] bg-[#17233A]/70 text-[11px] font-bold uppercase tracking-wider text-slate-400">
              <th className="py-3 px-4">Section ID</th>
              <th className="py-3 px-4">Semester</th>
              <th className="py-3 px-4">Section Name</th>
              <th className="py-3 px-4">Total Strength</th>
              <th className="py-3 px-4">Lab Sub-groups (50 / 50 Half Split)</th>
              <th className="py-3 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#26324A]/60 text-xs">
            {batches.map((b) => (
              <tr key={b.id} className="hover:bg-[#17233A]/40 transition-colors">
                <td className="py-3 px-4 font-mono font-bold text-teal-400">{b.section_id}</td>
                <td className="py-3 px-4 text-slate-300">Semester {b.semester}</td>
                <td className="py-3 px-4 text-slate-300">Section {b.section_name}</td>
                <td className="py-3 px-4">
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded">
                    <Users className="w-3 h-3" />
                    {b.strength} Students
                  </span>
                </td>
                <td className="py-3 px-4">
                  {b.sub_groups && b.sub_groups.length > 0 ? (
                    <div className="flex items-center gap-2 flex-wrap">
                      {b.sub_groups.map((g) => (
                        <span
                          key={g.id}
                          className="inline-flex items-center gap-1.5 text-[11px] font-medium bg-[#17233A] text-slate-200 border border-[#26324A] px-2.5 py-1 rounded-lg"
                        >
                          <span className="font-bold text-teal-300">{g.group_name}</span>
                          <span className="text-slate-400 font-mono text-[10px]">({g.strength} students)</span>
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-slate-500 italic text-[11px]">Single Group (Unsplit)</span>
                  )}
                </td>
                <td className="py-3 px-4 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => handleSplitLabGroups(b)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-teal-500/10 hover:bg-teal-500/20 text-teal-300 border border-teal-500/30 rounded-lg transition-colors shadow-none"
                      title="Split batch strictly 50/50 for laboratory scheduling"
                    >
                      <Scissors className="w-3.5 h-3.5 text-teal-400" />
                      <span>Auto-Split 50/50</span>
                    </button>
                    {b.sub_groups && b.sub_groups.length > 0 && (
                      <button
                        type="button"
                        onClick={() => handleResetGroups(b)}
                        className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-700/30 rounded-lg transition-colors"
                        title="Reset to Unified Single Group"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add Batch Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="card w-full max-w-md p-6 bg-[#121B2E] border border-teal-500/30 rounded-2xl shadow-2xl">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-[#26324A]">
              <h3 className="text-base font-bold text-white flex items-center gap-2 m-0">
                <Layers className="w-4 h-4 text-teal-400" />
                <span>Add Student Section</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-[#17233A] bg-transparent shadow-none"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddBatch} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-300">Section ID</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. CSE-5-B"
                    value={newBatch.section_id}
                    onChange={(e) => setNewBatch({ ...newBatch, section_id: e.target.value.toUpperCase() })}
                    className="w-full bg-[#17233A] border border-[#26324A] text-slate-200 text-xs rounded-lg px-3 py-2 font-mono uppercase focus:border-teal-400"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-300">Total Strength</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={newBatch.strength}
                    onChange={(e) => setNewBatch({ ...newBatch, strength: Number(e.target.value) })}
                    className="w-full bg-[#17233A] border border-[#26324A] text-slate-200 text-xs rounded-lg px-3 py-2 focus:border-teal-400"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-300">Semester</label>
                  <select
                    value={newBatch.semester}
                    onChange={(e) => setNewBatch({ ...newBatch, semester: Number(e.target.value) })}
                    className="w-full bg-[#17233A] border border-[#26324A] text-slate-200 text-xs rounded-lg px-3 py-2 focus:border-teal-400"
                  >
                    {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => (
                      <option key={s} value={s}>Semester {s}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-300">Section Name</label>
                  <input
                    type="text"
                    required
                    placeholder="A, B, or C"
                    value={newBatch.section_name}
                    onChange={(e) => setNewBatch({ ...newBatch, section_name: e.target.value.toUpperCase() })}
                    className="w-full bg-[#17233A] border border-[#26324A] text-slate-200 text-xs rounded-lg px-3 py-2 uppercase focus:border-teal-400"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-300">Department</label>
                <select
                  value={newBatch.department_id}
                  onChange={(e) => setNewBatch({ ...newBatch, department_id: e.target.value })}
                  className="w-full bg-[#17233A] border border-[#26324A] text-slate-200 text-xs rounded-lg px-3 py-2 focus:border-teal-400"
                >
                  <option value="dept-cse">Computer Science & Engineering</option>
                  <option value="dept-csai">CSE (AI & ML)</option>
                  <option value="dept-ece">Electronics & Communication</option>
                  <option value="dept-rob">Robotics & Automation</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#26324A]">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-gradient-to-r from-teal-400 to-emerald-400 text-[#06231F] font-bold text-xs px-5 py-2 rounded-lg shadow-md hover:brightness-110 transition-all"
                >
                  Save Section
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
