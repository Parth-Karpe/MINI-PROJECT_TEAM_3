"use client";

import React, { useCallback, useEffect, useState } from "react";
import { TimetableGrid } from "@/components/timetable-maker/TimetableGrid";
import { StudioToolbar } from "@/components/timetable-maker/StudioToolbar";
import type {
  Batch,
  Room,
  Teacher,
  TimetableConfig,
  TimetableSession,
  TimetableVersion,
} from "@/lib/types/timetable";

export default function TimetableMakerPage() {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [config, setConfig] = useState<TimetableConfig | null>(null);
  const [activeVersion, setActiveVersion] = useState<TimetableVersion | null>(null);
  const [sessions, setSessions] = useState<TimetableSession[]>([]);

  const [filterMode, setFilterMode] = useState<"batch" | "teacher" | "room">("batch");
  const [filterValue, setFilterValue] = useState<string>("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [notification, setNotification] = useState<{ msg: string; type: "ok" | "err" } | null>(null);

  const notify = (msg: string, type: "ok" | "err" = "ok") => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 5000);
  };

  const loadData = useCallback(async () => {
    try {
      const res = await fetch("/api/timetable-maker/data");
      if (res.ok) {
        const data = await res.json();
        setBatches(data.batches || []);
        setTeachers(data.teachers || []);
        setRooms(data.rooms || []);
        setConfig(data.config || null);
        setActiveVersion(data.activeVersion || null);
        setSessions(data.sessions || []);

        if (data.batches && data.batches.length > 0 && !filterValue) {
          setFilterValue(data.batches[0].section_id);
        }
      }
    } catch {
      notify("Failed to connect to timetable data service", "err");
    }
  }, [filterValue]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleGenerate = async (preserveLocked: boolean, targetBatchId?: string) => {
    setIsGenerating(true);
    try {
      const res = await fetch("/api/timetable-maker/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preserveLocked, batchId: targetBatchId }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSessions(data.sessions);
        notify(
          targetBatchId
            ? `Generated Section ${targetBatchId} (${data.count} sessions) in ${data.durationMs}ms!`
            : `Generated ${data.count} conflict-free sessions in ${data.durationMs}ms (${data.iterations} iterations)!`,
          "ok"
        );
      } else {
        const diag = data.diagnostics?.message || data.error || "Generation could not satisfy all constraints";
        notify(`⚠️ ${diag}`, "err");
      }
    } catch (e) {
      notify(e instanceof Error ? e.message : "Generation failed", "err");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSessionMove = async (
    sessionId: string,
    newDay: string,
    newStart: string,
    newEnd: string
  ): Promise<boolean> => {
    try {
      const res = await fetch("/api/timetable-maker/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          newDay,
          newStartTime: newStart,
          newEndTime: newEnd,
          applyMove: true,
        }),
      });
      const data = await res.json();
      if (res.ok && data.valid) {
        // Optimistically update local sessions
        setSessions((prev) =>
          prev.map((s) =>
            s.id === sessionId ? { ...s, day_of_week: newDay as any, start_time: newStart, end_time: newEnd } : s
          )
        );
        notify("Class moved successfully", "ok");
        return true;
      } else {
        notify(data.reason || "Move conflict detected", "err");
        return false;
      }
    } catch {
      notify("Validation network error", "err");
      return false;
    }
  };

  const handleToggleLock = (sessionId: string) => {
    setSessions((prev) =>
      prev.map((s) => (s.id === sessionId ? { ...s, is_locked: !s.is_locked } : s))
    );
  };

  const handlePublish = async () => {
    if (!window.confirm("Publish this timetable as the official semester schedule?")) return;
    try {
      const res = await fetch("/api/timetable-maker/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weeks: 16 }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        notify("Timetable published & locked in Timetable Guard!", "ok");
        loadData();
      } else {
        notify(data.error || "Failed to publish timetable", "err");
      }
    } catch {
      notify("Publish network error", "err");
    }
  };

  const handleExport = () => {
    window.open("/api/timetable-maker/export?format=csv", "_blank");
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "8px" }}>
        <h2>Timetable Studio</h2>
        <span style={{ fontSize: "12px", color: "var(--mu)" }}>
          {activeVersion ? activeVersion.name : "Active Schedule"}
        </span>
      </div>
      <p className="sub">
        Automated constraint scheduling & interactive weekly grid. Drag and drop classes to adjust; click the padlock icon to freeze specific classes before re-generating.
      </p>

      {notification && (
        <div
          className={notification.type === "ok" ? "msg ok" : "error-box"}
          style={{ marginBottom: "14px", padding: "10px 14px", borderRadius: "6px" }}
        >
          {notification.type === "ok" ? "✅ " : "⚠️ "}
          {notification.msg}
        </div>
      )}

      <StudioToolbar
        activeVersion={activeVersion}
        batches={batches}
        teachers={teachers}
        rooms={rooms}
        filterMode={filterMode}
        filterValue={filterValue}
        onFilterModeChange={setFilterMode}
        onFilterValueChange={setFilterValue}
        onGenerate={handleGenerate}
        onPublish={handlePublish}
        onExport={handleExport}
        isGenerating={isGenerating}
        sessionCount={sessions.length}
      />

      <TimetableGrid
        sessions={sessions}
        onSessionMove={handleSessionMove}
        onToggleLock={handleToggleLock}
        filterMode={filterMode}
        filterValue={filterValue}
        config={config}
      />
    </div>
  );
}
