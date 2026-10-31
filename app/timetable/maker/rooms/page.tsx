"use client";

import React, { useEffect, useState } from "react";
import type { Room } from "@/lib/types/timetable";
import { Building2, Plus, Trash2, CheckCircle2, AlertCircle, X, Shield, Users } from "lucide-react";

export default function RoomsPage() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const [newRoom, setNewRoom] = useState({
    room_id: "",
    name: "",
    building: "Block-A (CSE)",
    floor: 1,
    room_type: "classroom" as Room["room_type"],
    lab_specialization: "",
    capacity: 65,
    exclusive_use: true,
  });

  const loadData = async () => {
    try {
      const res = await fetch("/api/timetable-maker/data");
      if (res.ok) {
        const data = await res.json();
        setRooms(data.rooms || []);
      }
    } catch {
      setMsg({ text: "Failed to load rooms", ok: false });
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleAddRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch("/api/timetable-maker/data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "add_room",
          payload: {
            ...newRoom,
            capacity: Number(newRoom.capacity),
            floor: Number(newRoom.floor),
            is_active: true,
          },
        }),
      });
      if (res.ok) {
        setMsg({ text: `Room ${newRoom.room_id} added!`, ok: true });
        setShowAddModal(false);
        loadData();
      }
    } catch {
      setMsg({ text: "Failed to add room", ok: false });
    }
  };

  const handleDelete = async (id: string, roomId: string) => {
    if (!window.confirm(`Delete room ${roomId}?`)) return;
    try {
      const res = await fetch("/api/timetable-maker/data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete_room", payload: { id } }),
      });
      if (res.ok) {
        setMsg({ text: `Room ${roomId} deleted`, ok: true });
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
            <Building2 className="w-5 h-5 text-teal-400" />
            <span>Classroom & Laboratory Infrastructure</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Manage seating capacities, equipment specializations, and exclusive occupancy locks.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 bg-gradient-to-r from-teal-400 to-emerald-400 text-[#06231F] font-bold text-xs px-4 py-2.5 rounded-lg shadow-md shadow-teal-500/20 hover:brightness-110 transition-all"
        >
          <Plus className="w-4 h-4" />
          <span>Add Room / Lab</span>
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

      {/* Table */}
      <div className="card p-0 overflow-hidden border border-[#26324A] bg-[#121B2E] rounded-xl shadow-lg">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-[#26324A] bg-[#17233A]/70 text-[11px] font-bold uppercase tracking-wider text-slate-400">
              <th className="py-3 px-4">Room ID</th>
              <th className="py-3 px-4">Facility Name</th>
              <th className="py-3 px-4">Location</th>
              <th className="py-3 px-3">Room Type</th>
              <th className="py-3 px-4">Equipment / Specialization</th>
              <th className="py-3 px-3">Capacity</th>
              <th className="py-3 px-3">Occupancy Policy</th>
              <th className="py-3 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#26324A]/60 text-xs">
            {rooms.map((r) => (
              <tr key={r.id} className="hover:bg-[#17233A]/40 transition-colors">
                <td className="py-3 px-4 font-mono font-bold text-teal-400">{r.room_id}</td>
                <td className="py-3 px-4 font-medium text-slate-200">{r.name}</td>
                <td className="py-3 px-4 text-slate-400">
                  {r.building} <span className="text-[10px] text-slate-500 font-mono">(F{r.floor})</span>
                </td>
                <td className="py-3 px-3">
                  <span
                    className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded border ${
                      r.room_type === "lab"
                        ? "bg-amber-500/10 text-amber-300 border-amber-500/20"
                        : r.room_type === "seminar_hall"
                        ? "bg-purple-500/10 text-purple-300 border-purple-500/20"
                        : "bg-teal-500/10 text-teal-300 border-teal-500/20"
                    }`}
                  >
                    {r.room_type}
                  </span>
                </td>
                <td className="py-3 px-4 text-slate-300">
                  {r.lab_specialization || <span className="text-slate-500 italic">Standard</span>}
                </td>
                <td className="py-3 px-3">
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded">
                    <Users className="w-3 h-3" />
                    {r.capacity} seats
                  </span>
                </td>
                <td className="py-3 px-3">
                  <span
                    className={`text-[10.5px] font-medium flex items-center gap-1 ${
                      r.exclusive_use ? "text-teal-400" : "text-slate-400"
                    }`}
                  >
                    <Shield className="w-3 h-3" />
                    {r.exclusive_use ? "Exclusive" : "Shared"}
                  </span>
                </td>
                <td className="py-3 px-4 text-right">
                  <button
                    type="button"
                    onClick={() => handleDelete(r.id, r.room_id)}
                    className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded transition-colors"
                    title="Delete Facility"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add Room Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="card w-full max-w-md p-6 bg-[#121B2E] border border-teal-500/30 rounded-2xl shadow-2xl">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-[#26324A]">
              <h3 className="text-base font-bold text-white flex items-center gap-2 m-0">
                <Building2 className="w-4 h-4 text-teal-400" />
                <span>Add Facility / Room</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-[#17233A] bg-transparent shadow-none"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddRoom} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-300">Room ID</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. CS-LAB-3"
                    value={newRoom.room_id}
                    onChange={(e) => setNewRoom({ ...newRoom, room_id: e.target.value })}
                    className="w-full bg-[#17233A] border border-[#26324A] text-slate-200 text-xs rounded-lg px-3 py-2"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-300">Seating Capacity</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={newRoom.capacity}
                    onChange={(e) => setNewRoom({ ...newRoom, capacity: Number(e.target.value) })}
                    className="w-full bg-[#17233A] border border-[#26324A] text-slate-200 text-xs rounded-lg px-3 py-2"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-300">Facility Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Cloud Computing Lab"
                  value={newRoom.name}
                  onChange={(e) => setNewRoom({ ...newRoom, name: e.target.value })}
                  className="w-full bg-[#17233A] border border-[#26324A] text-slate-200 text-xs rounded-lg px-3 py-2"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-300">Building / Block</label>
                  <input
                    type="text"
                    required
                    value={newRoom.building}
                    onChange={(e) => setNewRoom({ ...newRoom, building: e.target.value })}
                    className="w-full bg-[#17233A] border border-[#26324A] text-slate-200 text-xs rounded-lg px-3 py-2"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-300">Floor</label>
                  <input
                    type="number"
                    value={newRoom.floor}
                    onChange={(e) => setNewRoom({ ...newRoom, floor: Number(e.target.value) })}
                    className="w-full bg-[#17233A] border border-[#26324A] text-slate-200 text-xs rounded-lg px-3 py-2"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-300">Room Type</label>
                  <select
                    value={newRoom.room_type}
                    onChange={(e) => setNewRoom({ ...newRoom, room_type: e.target.value as any })}
                    className="w-full bg-[#17233A] border border-[#26324A] text-slate-200 text-xs rounded-lg px-3 py-2"
                  >
                    <option value="classroom">Classroom (Lecture)</option>
                    <option value="lab">Laboratory (Practical)</option>
                    <option value="seminar_hall">Seminar Hall</option>
                    <option value="workshop">Workshop</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-300">Specialization</label>
                  <input
                    type="text"
                    placeholder="e.g. AI/ML GPU, IoT"
                    value={newRoom.lab_specialization}
                    onChange={(e) => setNewRoom({ ...newRoom, lab_specialization: e.target.value })}
                    className="w-full bg-[#17233A] border border-[#26324A] text-slate-200 text-xs rounded-lg px-3 py-2"
                  />
                </div>
              </div>

              <div className="pt-1">
                <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300 select-none">
                  <input
                    type="checkbox"
                    checked={newRoom.exclusive_use}
                    onChange={(e) => setNewRoom({ ...newRoom, exclusive_use: e.target.checked })}
                    className="w-4 h-4 rounded text-teal-400 bg-[#17233A] border-[#26324A]"
                  />
                  <span>Exclusive Use (Entire room locked during scheduled class)</span>
                </label>
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
                  Save Facility
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
