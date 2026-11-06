import { NextResponse } from "next/server";
import { timetableStore } from "@/lib/timetableStore";
import { finalizeTimetable } from "@/lib/engine";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { weekStart, weeks = 16, actorId = "hod_cse", actorRole = "hod" } = body;

    const activeVersion = timetableStore.getActiveVersion();
    if (!activeVersion) {
      return NextResponse.json({ error: "No active timetable version" }, { status: 400 });
    }

    const sessions = timetableStore.getSessions(activeVersion.id);
    if (!sessions || sessions.length === 0) {
      return NextResponse.json({ error: "No sessions to commit. Generate a timetable first." }, { status: 400 });
    }

    // Build standard CSV
    const headers = "entry_id,day,start_time,end_time,branch,semester,section,course_code,course_name,session_type,faculty_id,faculty_name,room_id,expected_students\n";
    const rows = sessions.map((s, idx) => {
      const entryId = `E${String(idx + 1).padStart(3, "0")}`;
      const branch = s.section_id.split("-")[0] || "CSE";
      const semester = s.section_id.split("-")[1] || "3";
      const section = s.section_id.split("-")[2] || "A";
      const expected = s.session_type === "lab" ? 30 : 60;
      return `${entryId},${s.day_of_week},${s.start_time},${s.end_time},${branch},${semester},${section},${s.course_code},"${s.course_name}",${s.session_type},${s.teacher_id},"${s.teacher_name || ""}",${s.room_id},${expected}`;
    }).join("\n");

    const csvText = headers + rows;

    // Update status in store
    timetableStore.updateVersionStatus(activeVersion.id, "published");

    // Attempt to notify default timetable finalize endpoint if available
    let guardResult: Record<string, unknown> | null = null;
    try {
      const res = await finalizeTimetable({
          csv_text: csvText,
          actor_id: actorId,
          actor_role: actorRole,
          week_start: weekStart ? `${weekStart}T00:00:00` : new Date().toISOString(),
          weeks: Number(weeks) || 16,
      });
      if (res.status >= 200 && res.status < 300) {
        guardResult = res.data;
      }
    } catch {
      // Python engine might not be running; that's fine, the timetable is published in Next.js
    }

    return NextResponse.json({
      success: true,
      message: `Timetable ${activeVersion.name} successfully published!`,
      sessions_count: sessions.length,
      csv_text: csvText,
      guard_result: guardResult,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Commit failed" },
      { status: 500 }
    );
  }
}
