"use client";

import React, { useEffect, useState } from "react";
import type { TimetableConfig, PeriodSlotTemplate } from "@/lib/types/timetable";
import {
  Settings2,
  Clock,
  Coffee,
  Utensils,
  Hourglass,
  Save,
  CheckCircle2,
  AlertCircle,
  Plus,
  Trash2,
  RotateCcw,
  Sparkles,
  ShieldAlert,
} from "lucide-react";

const DEFAULT_STANDARD_PERIODS: PeriodSlotTemplate[] = [
  { id: "slot-1", period_number: 1, label: "1st Class", start_time: "09:00", end_time: "10:00", is_break: false },
  { id: "slot-break1", label: "Morning Break", start_time: "10:00", end_time: "10:15", is_break: true, break_type: "short" },
  { id: "slot-2", period_number: 2, label: "2nd Class", start_time: "10:15", end_time: "11:15", is_break: false },
  { id: "slot-3", period_number: 3, label: "3rd Class", start_time: "11:15", end_time: "12:15", is_break: false },
  { id: "slot-lunch", label: "Lunch Break", start_time: "12:15", end_time: "13:00", is_break: true, break_type: "lunch" },
  { id: "slot-4", period_number: 4, label: "4th Class", start_time: "13:00", end_time: "14:00", is_break: false },
  { id: "slot-5", period_number: 5, label: "5th Class", start_time: "14:00", end_time: "15:00", is_break: false },
  { id: "slot-6", period_number: 6, label: "6th Class", start_time: "15:00", end_time: "16:00", is_break: false },
  { id: "slot-7", period_number: 7, label: "7th Class", start_time: "16:00", end_time: "17:00", is_break: false },
];

function getMinutes(t: string): number {
  if (!t) return 0;
  const [h, m] = t.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function formatMinutes(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export default function ConfigPage() {
  const [config, setConfig] = useState<TimetableConfig | null>(null);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  // New slot form state
  const [slotType, setSlotType] = useState<"class" | "break" | "buffer">("class");
  const [newSlot, setNewSlot] = useState({
    label: "",
    start_time: "09:00",
    end_time: "10:00",
  });

  const loadData = async () => {
    try {
      const res = await fetch("/api/timetable-maker/data");
      if (res.ok) {
        const data = await res.json();
        const cfg = data.config || null;
        if (cfg && (!cfg.period_slots || cfg.period_slots.length === 0)) {
          cfg.period_slots = [...DEFAULT_STANDARD_PERIODS];
        }
        setConfig(cfg);
      }
    } catch {
      setMsg({ text: "Failed to load configuration", ok: false });
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!config) return;

    // Automatically detect any gaps and populate them as Buffer Time slots so no time is unmanaged
    const currentSlots = [...(config.period_slots || [])].sort(
      (a, b) => getMinutes(a.start_time) - getMinutes(b.start_time)
    );

    const filledSlots: PeriodSlotTemplate[] = [];
    for (let i = 0; i < currentSlots.length; i++) {
      filledSlots.push(currentSlots[i]);
      if (i < currentSlots.length - 1) {
        const currEnd = getMinutes(currentSlots[i].end_time);
        const nextStart = getMinutes(currentSlots[i + 1].start_time);
        if (nextStart > currEnd) {
          filledSlots.push({
            id: `slot-buf-${Date.now()}-${i}`,
            label: "Buffer Time",
            start_time: currentSlots[i].end_time,
            end_time: currentSlots[i + 1].start_time,
            is_break: false,
            is_buffer: true,
          });
        }
      }
    }

    // Re-index instructional periods
    let pCount = 1;
    const finalSlots = filledSlots.map((s) => {
      if (!s.is_break && !s.is_buffer) {
        return { ...s, period_number: pCount++ };
      }
      return s;
    });

    const payload = {
      ...config,
      period_slots: finalSlots,
    };

    try {
      const res = await fetch("/api/timetable-maker/data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_config",
          payload,
        }),
      });
      if (res.ok) {
        setConfig(payload);
        setMsg({ text: "Schedule configuration & period template saved successfully!", ok: true });
        setTimeout(() => setMsg(null), 3500);
      } else {
        setMsg({ text: "Failed to save configuration", ok: false });
      }
    } catch {
      setMsg({ text: "Network error saving settings", ok: false });
    }
  };

  const toggleDay = (day: "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat") => {
    if (!config) return;
    const current = config.working_days || [];
    const updated = current.includes(day) ? current.filter((d) => d !== day) : [...current, day];
    setConfig({ ...config, working_days: updated });
  };

  const handleAddSlot = (e: React.FormEvent) => {
    e.preventDefault();
    if (!config) return;

    const defaultLabel =
      slotType === "buffer"
        ? "Buffer Time"
        : slotType === "break"
        ? "Break"
        : "Class Period";

    const label = newSlot.label.trim() || defaultLabel;
    const existingSlots = config.period_slots || [];
    const id = `slot-${Date.now()}`;

    const is_break = slotType === "break";
    const is_buffer = slotType === "buffer";

    const nextSlot: PeriodSlotTemplate = {
      id,
      label,
      start_time: newSlot.start_time,
      end_time: newSlot.end_time,
      is_break,
      is_buffer,
      break_type: is_break ? "short" : undefined,
      period_number: is_break || is_buffer ? undefined : existingSlots.filter((s) => !s.is_break && !s.is_buffer).length + 1,
    };

    const updated = [...existingSlots, nextSlot].sort(
      (a, b) => getMinutes(a.start_time) - getMinutes(b.start_time)
    );

    // Re-index periods
    let pCount = 1;
    const reindexed = updated.map((s) => {
      if (!s.is_break && !s.is_buffer) {
        return { ...s, period_number: pCount++ };
      }
      return s;
    });

    setConfig({
      ...config,
      period_slots: reindexed,
    });

    setNewSlot({
      label: "",
      start_time: nextSlot.end_time,
      end_time: formatMinutes(getMinutes(nextSlot.end_time) + 60),
    });
  };

  const handleAddBufferSlot = (startTime: string, endTime: string) => {
    if (!config) return;
    const existingSlots = config.period_slots || [];
    const id = `slot-buf-${Date.now()}`;
    const nextSlot: PeriodSlotTemplate = {
      id,
      label: "Buffer Time",
      start_time: startTime,
      end_time: endTime,
      is_break: false,
      is_buffer: true,
    };

    const updated = [...existingSlots, nextSlot].sort(
      (a, b) => getMinutes(a.start_time) - getMinutes(b.start_time)
    );

    let pCount = 1;
    const reindexed = updated.map((s) => {
      if (!s.is_break && !s.is_buffer) {
        return { ...s, period_number: pCount++ };
      }
      return s;
    });

    setConfig({
      ...config,
      period_slots: reindexed,
    });
  };

  const handleDeleteSlot = (id: string) => {
    if (!config) return;
    const updated = (config.period_slots || []).filter((s) => s.id !== id);
    let pCount = 1;
    const reindexed = updated.map((s) => {
      if (!s.is_break && !s.is_buffer) {
        return { ...s, period_number: pCount++ };
      }
      return s;
    });
    setConfig({ ...config, period_slots: reindexed });
  };

  const handleResetTemplate = () => {
    if (!config) return;
    if (!window.confirm("Reset to college standard period template?")) return;
    setConfig({
      ...config,
      period_slots: [...DEFAULT_STANDARD_PERIODS],
    });
  };

  if (!config) {
    return <div className="text-slate-400 p-6 text-xs">Loading operational rules…</div>;
  }

  // Sort slots chronologically
  const periodSlots = [...(config.period_slots || DEFAULT_STANDARD_PERIODS)].sort(
    (a, b) => getMinutes(a.start_time) - getMinutes(b.start_time)
  );

  return (
    <div className="max-w-4xl space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-white flex items-center gap-2.5">
          <Settings2 className="w-5 h-5 text-teal-400" />
          <span>Timetable Operational Rules & Period Template</span>
        </h2>
        <p className="text-xs text-slate-400 mt-1">
          Configure active campus days (including Saturday), standard period slots, non-instructional breaks, and unallocated transition buffers.
        </p>
      </div>

      {msg && (
        <div
          className={`flex items-center gap-2 p-3 rounded-lg text-xs font-medium border ${
            msg.ok ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-300" : "bg-rose-500/10 border-rose-500/20 text-rose-300"
          }`}
        >
          {msg.ok ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <AlertCircle className="w-4 h-4 text-rose-400" />}
          <span>{msg.text}</span>
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-6">
        {/* Working Days */}
        <div className="card p-5 border border-[#26324A] bg-[#121B2E] rounded-xl shadow-lg">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 pb-2 mb-3 border-b border-[#26324A]">
            Campus Working Days (Mon – Sat)
          </h3>
          <div className="flex flex-wrap gap-2.5">
            {(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const).map((day) => {
              const active = config.working_days?.includes(day);
              return (
                <button
                  type="button"
                  key={day}
                  onClick={() => toggleDay(day)}
                  className={`px-4 py-2 rounded-lg text-xs font-bold transition-all border shadow-none ${
                    active
                      ? "bg-teal-500/20 text-teal-300 border-teal-500/40 shadow-sm"
                      : "bg-[#17233A] text-slate-400 border-[#26324A] hover:border-slate-500 hover:text-slate-200"
                  }`}
                >
                  {day} {active ? "✓" : ""}
                </button>
              );
            })}
          </div>
        </div>

        {/* Standard Time Slots / Period Template Manager */}
        <div className="card p-5 border border-[#26324A] bg-[#121B2E] rounded-xl shadow-lg">
          <div className="flex items-center justify-between pb-3 mb-4 border-b border-[#26324A]">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                <Clock className="w-3.5 h-3.5 text-teal-400" />
                <span>Standard Time Slots & Period Template</span>
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Fixed standard periods, breaks, and transition buffers. Any unallocated gaps between slots are auto-detected and managed as buffer time.
              </p>
            </div>
            <button
              type="button"
              onClick={handleResetTemplate}
              className="flex items-center gap-1.5 text-[11px] text-slate-400 hover:text-teal-300 px-2.5 py-1 rounded bg-[#17233A] border border-[#26324A]"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset Template</span>
            </button>
          </div>

          {/* Slots Table - Grid aligned */}
          <div className="space-y-2 mb-4">
            {/* Header Column Labels */}
            <div className="grid grid-cols-[32px_120px_1fr_180px_36px] items-center gap-3 px-3.5 py-1 text-[10.5px] uppercase font-bold tracking-wider text-slate-400">
              <span>#</span>
              <span>Type</span>
              <span>Slot Label</span>
              <span className="text-right pr-6">Time Window</span>
              <span className="text-right">Action</span>
            </div>

            {periodSlots.map((slot, idx) => {
              const startM = getMinutes(slot.start_time);
              const endM = getMinutes(slot.end_time);
              const durationM = Math.max(0, endM - startM);

              // Check if there is an unallocated gap between this slot and the next
              const nextSlot = periodSlots[idx + 1];
              let gapStart = "";
              let gapEnd = "";
              let gapDuration = 0;
              if (nextSlot) {
                const nextStartM = getMinutes(nextSlot.start_time);
                if (nextStartM > endM) {
                  gapStart = slot.end_time;
                  gapEnd = nextSlot.start_time;
                  gapDuration = nextStartM - endM;
                }
              }

              return (
                <React.Fragment key={slot.id}>
                  {/* Slot Row */}
                  <div
                    className={`grid grid-cols-[32px_120px_1fr_180px_36px] items-center gap-3 px-3.5 py-2.5 rounded-lg border text-xs transition-colors ${
                      slot.is_buffer
                        ? "bg-cyan-500/10 border-cyan-500/30 text-cyan-200"
                        : slot.is_break
                        ? "bg-amber-500/5 border-amber-500/25 text-amber-200"
                        : "bg-[#17233A] border-[#26324A] text-slate-200"
                    }`}
                  >
                    {/* Col 1: Index */}
                    <span className="font-mono text-slate-400 text-xs font-semibold">
                      #{idx + 1}
                    </span>

                    {/* Col 2: Slot Type Badge */}
                    <span
                      className={`text-[10px] uppercase font-bold px-2.5 py-1 rounded text-center shrink-0 flex items-center justify-center gap-1 ${
                        slot.is_buffer
                          ? "bg-cyan-400/20 text-cyan-300 border border-cyan-400/30 font-mono"
                          : slot.is_break
                          ? "bg-amber-400/20 text-amber-300 border border-amber-400/30"
                          : "bg-teal-400/20 text-teal-300 border border-teal-400/30"
                      }`}
                    >
                      {slot.is_buffer ? (
                        <>
                          <Hourglass className="w-2.5 h-2.5" />
                          <span>Buffer Time</span>
                        </>
                      ) : slot.is_break ? (
                        <>
                          <Coffee className="w-2.5 h-2.5" />
                          <span>Break Slot</span>
                        </>
                      ) : (
                        <span>Period {slot.period_number || idx + 1}</span>
                      )}
                    </span>

                    {/* Col 3: Slot Label input */}
                    <div className="min-w-0">
                      <input
                        type="text"
                        value={slot.label}
                        onChange={(e) => {
                          const updated = [...periodSlots];
                          updated[idx].label = e.target.value;
                          setConfig({ ...config, period_slots: updated });
                        }}
                        className="w-full bg-[#121B2E] border border-[#26324A] hover:border-slate-500 focus:border-teal-400 rounded-md px-2.5 py-1 text-xs font-semibold text-white focus:outline-none transition-colors"
                        placeholder="Slot Label"
                      />
                    </div>

                    {/* Col 4: Time Range Inputs + Duration */}
                    <div className="flex items-center gap-1.5 font-mono text-xs justify-end shrink-0">
                      <input
                        type="text"
                        value={slot.start_time}
                        onChange={(e) => {
                          const updated = [...periodSlots];
                          updated[idx].start_time = e.target.value;
                          setConfig({ ...config, period_slots: updated });
                        }}
                        className="w-16 bg-[#121B2E] border border-[#26324A] text-center rounded-md px-1 py-1 text-slate-200 focus:border-teal-400 focus:outline-none"
                      />
                      <span className="text-slate-500">–</span>
                      <input
                        type="text"
                        value={slot.end_time}
                        onChange={(e) => {
                          const updated = [...periodSlots];
                          updated[idx].end_time = e.target.value;
                          setConfig({ ...config, period_slots: updated });
                        }}
                        className="w-16 bg-[#121B2E] border border-[#26324A] text-center rounded-md px-1 py-1 text-slate-200 focus:border-teal-400 focus:outline-none"
                      />
                      <span className="text-[10px] text-slate-400 bg-slate-800/80 px-1.5 py-0.5 rounded border border-slate-700/60 ml-0.5">
                        {durationM}m
                      </span>
                    </div>

                    {/* Col 5: Delete */}
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => handleDeleteSlot(slot.id)}
                        className="text-slate-500 hover:text-rose-400 transition-colors p-1 rounded hover:bg-[#121B2E]"
                        title="Delete slot"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Unallocated Gap Row (if present) */}
                  {gapDuration > 0 && (
                    <div className="flex items-center justify-between px-3.5 py-2 rounded-lg border border-dashed border-cyan-500/40 bg-cyan-950/20 text-cyan-300 text-xs my-1 shadow-sm">
                      <div className="flex items-center gap-2.5">
                        <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
                        <span className="font-semibold text-cyan-200">Unallocated Time Gap:</span>
                        <span className="font-mono bg-cyan-900/50 px-2 py-0.5 rounded border border-cyan-500/30 text-cyan-200 font-bold">
                          {gapStart} – {gapEnd} ({gapDuration} min)
                        </span>
                        <span className="text-[11px] text-cyan-400/90 font-medium hidden sm:inline">
                          — Protected Buffer / Transition Time
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleAddBufferSlot(gapStart, gapEnd)}
                        className="flex items-center gap-1.5 text-[11px] font-bold bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-200 border border-cyan-500/40 px-3 py-1 rounded transition-all"
                      >
                        <Plus className="w-3 h-3" />
                        <span>Keep as Buffer Slot</span>
                      </button>
                    </div>
                  )}
                </React.Fragment>
              );
            })}
          </div>

          {/* Add Slot Form */}
          <div className="pt-4 border-t border-[#26324A]">
            <div className="flex items-center justify-between mb-2">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Add Custom Slot or Buffer
              </div>
              <div className="flex items-center gap-1.5 text-xs">
                <button
                  type="button"
                  onClick={() => setSlotType("class")}
                  className={`px-2.5 py-1 rounded text-[11px] font-bold border transition-all ${
                    slotType === "class"
                      ? "bg-teal-500/20 text-teal-300 border-teal-500/40"
                      : "bg-[#17233A] text-slate-400 border-[#26324A] hover:text-slate-200"
                  }`}
                >
                  Class Period
                </button>
                <button
                  type="button"
                  onClick={() => setSlotType("break")}
                  className={`px-2.5 py-1 rounded text-[11px] font-bold border transition-all ${
                    slotType === "break"
                      ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                      : "bg-[#17233A] text-slate-400 border-[#26324A] hover:text-slate-200"
                  }`}
                >
                  Break Slot
                </button>
                <button
                  type="button"
                  onClick={() => setSlotType("buffer")}
                  className={`px-2.5 py-1 rounded text-[11px] font-bold border transition-all ${
                    slotType === "buffer"
                      ? "bg-cyan-500/20 text-cyan-300 border-cyan-500/40"
                      : "bg-[#17233A] text-slate-400 border-[#26324A] hover:text-slate-200"
                  }`}
                >
                  Buffer Time
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-5 gap-2.5 items-end">
              <div className="md:col-span-2">
                <label className="text-[11px] text-slate-400 block mb-1">
                  {slotType === "buffer" ? "Buffer Label" : slotType === "break" ? "Break Label" : "Period Label"}
                </label>
                <input
                  type="text"
                  placeholder={
                    slotType === "buffer"
                      ? "e.g. Buffer Time"
                      : slotType === "break"
                      ? "e.g. Tea Break / Recess"
                      : "e.g. 5th Class"
                  }
                  value={newSlot.label}
                  onChange={(e) => setNewSlot({ ...newSlot, label: e.target.value })}
                  className="w-full bg-[#17233A] border border-[#26324A] text-slate-200 text-xs rounded-lg px-2.5 py-1.5 focus:border-teal-400"
                />
              </div>
              <div>
                <label className="text-[11px] text-slate-400 block mb-1">Start Time</label>
                <input
                  type="text"
                  placeholder="09:00"
                  value={newSlot.start_time}
                  onChange={(e) => setNewSlot({ ...newSlot, start_time: e.target.value })}
                  className="w-full bg-[#17233A] border border-[#26324A] text-slate-200 text-xs rounded-lg px-2 py-1.5 font-mono text-center focus:border-teal-400"
                />
              </div>
              <div>
                <label className="text-[11px] text-slate-400 block mb-1">End Time</label>
                <input
                  type="text"
                  placeholder="10:00"
                  value={newSlot.end_time}
                  onChange={(e) => setNewSlot({ ...newSlot, end_time: e.target.value })}
                  className="w-full bg-[#17233A] border border-[#26324A] text-slate-200 text-xs rounded-lg px-2 py-1.5 font-mono text-center focus:border-teal-400"
                />
              </div>
              <div>
                <button
                  type="button"
                  onClick={handleAddSlot}
                  className="w-full flex items-center justify-center gap-1.5 bg-teal-500/20 text-teal-300 border border-teal-500/30 hover:bg-teal-500/30 font-bold text-xs py-1.5 rounded-lg transition-all"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add {slotType === "buffer" ? "Buffer" : slotType === "break" ? "Break" : "Period"}</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Submit */}
        <div className="flex justify-end pt-2">
          <button
            type="submit"
            className="flex items-center gap-2 bg-gradient-to-r from-teal-400 to-emerald-400 text-[#06231F] font-bold text-xs px-5 py-2.5 rounded-lg shadow-md shadow-teal-500/20 hover:brightness-110 transition-all"
          >
            <Save className="w-4 h-4" />
            <span>Save Operational Rules & Template</span>
          </button>
        </div>
      </form>
    </div>
  );
}
