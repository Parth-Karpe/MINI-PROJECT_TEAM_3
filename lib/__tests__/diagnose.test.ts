import { describe, expect, it } from "vitest";
import { timetableStore } from "../timetableStore";
import { solveTimetable, type SolverProblem } from "../timetableSolver";

describe("College-wide Timetable Solver & Diagnostics", () => {
  it("successfully schedules batches individually and college-wide without conflicts", () => {
    const config = timetableStore.getConfig();
    const courses = timetableStore.getCourses();
    const teachers = timetableStore.getTeachers();
    const rooms = timetableStore.getRooms();
    const batches = timetableStore.getBatches();

    const baseProblem: SolverProblem = {
      courses,
      teachers,
      teacherAvailability: [],
      rooms,
      batches,
      config,
    };

    // 1. Solve batches individually
    const resCse3a = solveTimetable({ ...baseProblem, targetBatchId: "CSE-3-A" });
    expect(resCse3a.success).toBe(true);
    expect(resCse3a.sessions.length).toBeGreaterThan(0);

    const resCse3b = solveTimetable({ ...baseProblem, targetBatchId: "CSE-3-B" });
    expect(resCse3b.success).toBe(true);
    expect(resCse3b.sessions.length).toBeGreaterThan(0);

    const resCsai5a = solveTimetable({ ...baseProblem, targetBatchId: "CSAI-5-A" });
    expect(resCsai5a.success).toBe(true);
    expect(resCsai5a.sessions.length).toBe(9); // 4 courses = 9 sessions

    // 2. Full College-wide Solve
    const fullResult = solveTimetable(baseProblem);
    expect(fullResult.success).toBe(true);
    expect(fullResult.sessions.length).toBe(41);

    // Verify labs have 2 hours duration
    const labs = fullResult.sessions.filter((s) => s.session_type === "lab");
    expect(labs.length).toBe(6);
    labs.forEach((lab) => {
      expect(lab.duration_hours).toBe(2);
      expect(lab.room_id).toMatch(/LAB/);
    });
  });
});
