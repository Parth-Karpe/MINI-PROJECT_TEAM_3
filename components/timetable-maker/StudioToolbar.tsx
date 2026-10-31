"use client";

import React from "react";
import type { Batch, Room, Teacher, TimetableVersion } from "@/lib/types/timetable";
import { Zap, Lock, UploadCloud, Download, CheckCircle2, Clock } from "lucide-react";

interface StudioToolbarProps {
  activeVersion: TimetableVersion | null;
  batches: Batch[];
  teachers: Teacher[];
  rooms: Room[];
  filterMode: "batch" | "teacher" | "room";
  filterValue: string;
  onFilterModeChange: (mode: "batch" | "teacher" | "room") => void;
  onFilterValueChange: (val: string) => void;
  onGenerate: (preserveLocked: boolean, batchId?: string) => Promise<void>;
  onPublish: () => Promise<void>;
  onExport: () => void;
  isGenerating: boolean;
  sessionCount: number;
}

export function StudioToolbar({
  activeVersion,
  batches,
  teachers,
  rooms,
  filterMode,
  filterValue,
  onFilterModeChange,
  onFilterValueChange,
  onGenerate,
  onPublish,
  onExport,
  isGenerating,
  sessionCount,
}: StudioToolbarProps) {
  return (
    <div className="card flex flex-wrap items-center justify-between gap-4 p-4 mb-5 border border-[#26324A] bg-[#121B2E] rounded-xl shadow-lg shadow-black/20">
      {/* Left: View Filter Controls */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Segmented Control */}
        <div className="flex p-0.5 bg-[#17233A] rounded-lg border border-[#26324A]">
          <button
            type="button"
            onClick={() => {
              onFilterModeChange("batch");
              onFilterValueChange(batches[0]?.section_id || "");
            }}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all shadow-none ${
              filterMode === "batch"
                ? "bg-[#4FD1C5] text-[#06231F]"
                : "bg-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            By Batch
          </button>
          <button
            type="button"
            onClick={() => {
              onFilterModeChange("teacher");
              onFilterValueChange(teachers[0]?.name || "");
            }}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all shadow-none ${
              filterMode === "teacher"
                ? "bg-[#4FD1C5] text-[#06231F]"
                : "bg-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            By Faculty
          </button>
          <button
            type="button"
            onClick={() => {
              onFilterModeChange("room");
              onFilterValueChange(rooms[0]?.room_id || "");
            }}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all shadow-none ${
              filterMode === "room"
                ? "bg-[#4FD1C5] text-[#06231F]"
                : "bg-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            By Room
          </button>
        </div>

        {/* Dropdown for specific target */}
        <div className="min-w-[200px]">
          <select
            value={filterValue}
            onChange={(e) => onFilterValueChange(e.target.value)}
            className="w-full text-xs font-medium bg-[#17233A] border border-[#26324A] text-slate-200 rounded-lg px-3 py-1.5 focus:border-[#4FD1C5]"
          >
            {filterMode === "batch" && (
              <>
                <option value="">All Batches / Sections</option>
                {batches.map((b) => (
                  <option key={b.id} value={b.section_id}>
                    Section {b.section_id} ({b.strength} students)
                  </option>
                ))}
              </>
            )}
            {filterMode === "teacher" && (
              <>
                <option value="">All Faculty Instructors</option>
                {teachers.map((t) => (
                  <option key={t.id} value={t.name}>
                    {t.name} ({t.faculty_id} - {t.designation})
                  </option>
                ))}
              </>
            )}
            {filterMode === "room" && (
              <>
                <option value="">All Rooms & Labs</option>
                {rooms.map((r) => (
                  <option key={r.id} value={r.room_id}>
                    {r.name} ({r.room_id} - {r.room_type})
                  </option>
                ))}
              </>
            )}
          </select>
        </div>

        {/* Live Counters */}
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2.5 py-1 rounded-md">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            {sessionCount} Sessions
          </span>

          {activeVersion && (
            <span className="text-[11px] font-semibold uppercase tracking-wider bg-amber-500/15 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded">
              {activeVersion.status}
            </span>
          )}
        </div>
      </div>

      {/* Right: Actions */}
      <div className="flex flex-wrap items-center gap-2">
        {filterMode === "batch" && filterValue && (
          <button
            type="button"
            onClick={() => onGenerate(false, filterValue)}
            disabled={isGenerating}
            className="flex items-center gap-1.5 bg-gradient-to-r from-teal-400 to-emerald-400 text-[#06231F] font-bold text-xs px-3.5 py-2 rounded-lg hover:brightness-110 shadow-md shadow-teal-500/20 transition-all"
            title={`Schedule classes specifically for batch ${filterValue}`}
          >
            <Zap className="w-4 h-4 fill-current" />
            <span>{isGenerating ? "Solving…" : `Auto Generate (${filterValue})`}</span>
          </button>
        )}

        <button
          type="button"
          onClick={() => onGenerate(false)}
          disabled={isGenerating}
          className={`flex items-center gap-1.5 font-bold text-xs px-3.5 py-2 rounded-lg transition-all ${
            filterMode === "batch"
              ? "bg-[#17233A] text-slate-200 border border-[#26324A] hover:bg-[#1E2C4A]"
              : "bg-gradient-to-r from-teal-400 to-emerald-400 text-[#06231F] shadow-md shadow-teal-500/20 hover:brightness-110"
          }`}
          title="Schedule classes for all batches across college"
        >
          <Zap className="w-4 h-4 fill-current" />
          <span>{isGenerating ? "Solving CSP…" : "Auto Generate All"}</span>
        </button>

        <button
          type="button"
          className="sec flex items-center gap-1.5 text-xs px-3.5 py-2 rounded-lg border border-[#26324A] bg-[#17233A] text-slate-200 hover:bg-[#1E2C4A] transition-all"
          onClick={() => onGenerate(true)}
          disabled={isGenerating || sessionCount === 0}
          title="Keeps locked classes in place and re-allocates remaining slots"
        >
          <Lock className="w-3.5 h-3.5 text-amber-400" />
          <span>Lock & Re-Gen</span>
        </button>

        <button
          type="button"
          className="sec flex items-center gap-1.5 text-xs px-3.5 py-2 rounded-lg border border-[#26324A] bg-[#17233A] text-slate-200 hover:bg-[#1E2C4A] transition-all"
          onClick={onPublish}
          disabled={sessionCount === 0}
          title="Finalizes and commits timetable into the campus optimizer"
        >
          <UploadCloud className="w-3.5 h-3.5 text-teal-400" />
          <span>Publish</span>
        </button>

        <button
          type="button"
          className="sec flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border border-[#26324A] bg-[#17233A] text-slate-200 hover:bg-[#1E2C4A] transition-all"
          onClick={onExport}
          disabled={sessionCount === 0}
        >
          <Download className="w-3.5 h-3.5 text-slate-400" />
          <span>CSV</span>
        </button>
      </div>
    </div>
  );
}
