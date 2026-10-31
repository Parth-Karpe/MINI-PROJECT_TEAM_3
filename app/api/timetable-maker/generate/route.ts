import { NextResponse } from "next/server";
import { timetableStore } from "@/lib/timetableStore";
import { solveTimetable, type SolverProblem } from "@/lib/timetableSolver";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { preserveLocked = false, batchId } = body;

    const activeVersion = timetableStore.getActiveVersion();
    if (!activeVersion) {
      return NextResponse.json({ error: "No active timetable version found" }, { status: 400 });
    }

    const existingSessions = timetableStore.getSessions(activeVersion.id);
    const lockedSessions = preserveLocked ? existingSessions.filter((s) => s.is_locked) : [];

    const problem: SolverProblem = {
      courses: timetableStore.getCourses(),
      teachers: timetableStore.getTeachers(),
      teacherAvailability: timetableStore.getTeacherAvailability(),
      rooms: timetableStore.getRooms(),
      batches: timetableStore.getBatches(),
      config: timetableStore.getConfig(),
      lockedSessions,
      targetBatchId: batchId,
    };

    const result = solveTimetable(problem);

    if (result.success) {
      // If batchId was targeted, keep sessions from other batches
      const baseSessions = batchId
        ? existingSessions.filter((s) => s.section_id !== batchId || (preserveLocked && s.is_locked))
        : lockedSessions;

      const allSessions = [...baseSessions];
      for (const s of result.sessions) {
        if (!allSessions.some((l) => l.course_code === s.course_code && l.day_of_week === s.day_of_week && l.start_time === s.start_time && l.section_id === s.section_id)) {
          allSessions.push(s);
        }
      }

      timetableStore.saveSessions(activeVersion.id, allSessions);
      timetableStore.updateVersionStatus(activeVersion.id, "draft");

      return NextResponse.json({
        success: true,
        sessions: allSessions,
        durationMs: result.durationMs,
        iterations: result.iterations,
        count: allSessions.length,
      });
    } else {
      return NextResponse.json(
        {
          success: false,
          error: "Unable to schedule all sessions without conflicts",
          diagnostics: result.diagnostics,
          durationMs: result.durationMs,
          iterations: result.iterations,
        },
        { status: 422 }
      );
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Timetable generation failed" },
      { status: 500 }
    );
  }
}
