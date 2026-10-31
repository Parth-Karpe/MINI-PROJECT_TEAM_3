import { describe, expect, it } from "vitest";
import { solveTimetable, generateCandidateTimeSlots, type SolverProblem } from "../timetableSolver";
import type { Course, Teacher, Room, Batch, TimetableConfig } from "../types/timetable";

describe("TypeScript Timetable CSP Solver", () => {
  const teachers: Teacher[] = [
    { id: "t1", faculty_id: "F001", department_id: "cse", name: "Dr. Ananya Rao", designation: "Prof", max_weekly_hours: 20, max_daily_hours: 4, is_active: true },
    { id: "t2", faculty_id: "F002", department_id: "cse", name: "Prof. Vikram Desai", designation: "Asst Prof", max_weekly_hours: 20, max_daily_hours: 4, is_active: true },
  ];

  const rooms: Room[] = [
    { id: "r1", room_id: "CS-101", name: "Classroom 101", building: "Block A", floor: 1, room_type: "classroom", capacity: 60, exclusive_use: true, is_active: true },
    { id: "r2", room_id: "CS-LAB-1", name: "DSA Lab", building: "Block A", floor: 1, room_type: "lab", lab_specialization: "General / DSA", capacity: 40, exclusive_use: true, is_active: true },
  ];

  const batches: Batch[] = [
    { id: "b1", section_id: "CSE-3-A", department_id: "cse", semester: 3, section_name: "A", strength: 35, academic_year: "2026-2027" },
  ];

  const courses: Course[] = [
    {
      id: "c1",
      course_code: "CSE3-DS",
      course_name: "Data Structures",
      department_id: "cse",
      semester: 3,
      academic_year: "2026-2027",
      credits: 4,
      lecture_count: 3,
      tutorial_count: 1,
      practical_count: 0,
      lecture_duration: 1.0,
      tutorial_duration: 1.0,
      practical_duration: 2.0,
      total_weekly_hours: 4.0,
      required_room_type: "classroom",
      assigned_teachers: ["F001"],
    },
    {
      id: "c2",
      course_code: "CSE3-DSL",
      course_name: "Data Structures Lab",
      department_id: "cse",
      semester: 3,
      academic_year: "2026-2027",
      credits: 2,
      lecture_count: 0,
      tutorial_count: 0,
      practical_count: 1,
      lecture_duration: 1.0,
      tutorial_duration: 1.0,
      practical_duration: 2.0,
      total_weekly_hours: 2.0,
      required_room_type: "lab",
      required_lab_specialization: "General / DSA",
      assigned_teachers: ["F001"],
    },
    {
      id: "c3",
      course_code: "CSE3-DLD",
      course_name: "Digital Logic",
      department_id: "cse",
      semester: 3,
      academic_year: "2026-2027",
      credits: 3,
      lecture_count: 2,
      tutorial_count: 0,
      practical_count: 0,
      lecture_duration: 1.0,
      tutorial_duration: 1.0,
      practical_duration: 2.0,
      total_weekly_hours: 2.0,
      required_room_type: "classroom",
      assigned_teachers: ["F002"],
    },
  ];

  const config: TimetableConfig = {
    id: "cfg1",
    name: "Standard Config",
    working_days: ["Mon", "Tue", "Wed", "Thu", "Fri"],
    day_start_time: "08:00",
    day_end_time: "17:00",
    period_duration_minutes: 60,
    break_slots: [
      { name: "Short Break", start: "11:00", end: "11:15" },
      { name: "Lunch Break", start: "13:15", end: "14:00" },
    ],
    max_faculty_daily_hours: 4,
  };

  it("successfully schedules all courses without any collisions", () => {
    const problem: SolverProblem = {
      courses,
      teachers,
      teacherAvailability: [],
      rooms,
      batches,
      config,
    };

    const result = solveTimetable(problem);
    expect(result.success).toBe(true);
    // Expected sessions:
    // c1: 3 theory + 1 tutorial = 4 sessions
    // c2: 1 practical (2h) = 1 session
    // c3: 2 theory = 2 sessions
    // Total = 7 sessions
    expect(result.sessions.length).toBe(7);

    // Verify lab is in CS-LAB-1 and has duration 2
    const labSession = result.sessions.find((s) => s.course_code === "CSE3-DSL");
    expect(labSession).toBeDefined();
    expect(labSession?.room_id).toBe("CS-LAB-1");
    expect(labSession?.duration_hours).toBe(2);

    // Verify zero teacher overlaps
    for (let i = 0; i < result.sessions.length; i++) {
      for (let j = i + 1; j < result.sessions.length; j++) {
        const s1 = result.sessions[i];
        const s2 = result.sessions[j];
        if (s1.day_of_week === s2.day_of_week) {
          // Check if same teacher or same batch or same room
          const isSameTeacher = s1.teacher_id === s2.teacher_id;
          const isSameBatch = s1.batch_id === s2.batch_id;
          const isSameRoom = s1.room_id === s2.room_id;

          if (isSameTeacher || isSameBatch || isSameRoom) {
            // Check interval intersection
            const [h1s, m1s] = s1.start_time.split(":").map(Number);
            const [h1e, m1e] = s1.end_time.split(":").map(Number);
            const t1s = h1s + (m1s || 0) / 60;
            const t1e = h1e + (m1e || 0) / 60;

            const [h2s, m2s] = s2.start_time.split(":").map(Number);
            const [h2e, m2e] = s2.end_time.split(":").map(Number);
            const t2s = h2s + (m2s || 0) / 60;
            const t2e = h2e + (m2e || 0) / 60;

            const overlaps = t1s < t2e && t2s < t1e;
            expect(overlaps).toBe(false);
          }
        }
      }
    }
  });

  it("includes Saturday candidate slots when configured in working_days", () => {
    const configWithSat: TimetableConfig = {
      ...config,
      working_days: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
    };
    const slots = generateCandidateTimeSlots(configWithSat, 1.0);
    const satSlots = slots.filter((s: any) => s.day === "Sat");
    expect(satSlots.length).toBeGreaterThan(0);
  });

  it("successfully schedules Semester 5 (4 courses, 9 sessions)", () => {
    const sem5Courses: Course[] = [
      {
        id: "c-csai5-dl",
        course_code: "CSAI5-DL",
        course_name: "Deep Learning Fundamentals",
        department_id: "dept-csai",
        semester: 5,
        academic_year: "2026-2027",
        credits: 4,
        lecture_count: 3,
        tutorial_count: 1,
        practical_count: 0,
        lecture_duration: 1.0,
        tutorial_duration: 1.0,
        practical_duration: 2.0,
        total_weekly_hours: 4.0,
        required_room_type: "classroom",
        assigned_teachers: ["F001"],
      },
      {
        id: "c-csai5-dll",
        course_code: "CSAI5-DLL",
        course_name: "Deep Learning Lab",
        department_id: "dept-csai",
        semester: 5,
        academic_year: "2026-2027",
        credits: 2,
        lecture_count: 0,
        tutorial_count: 0,
        practical_count: 1,
        lecture_duration: 1.0,
        tutorial_duration: 1.0,
        practical_duration: 2.0,
        total_weekly_hours: 2.0,
        required_room_type: "lab",
        required_lab_specialization: "General / DSA",
        assigned_teachers: ["F001"],
      },
      {
        id: "c-csai5-ml",
        course_code: "CSAI5-ML",
        course_name: "Machine Learning",
        department_id: "dept-csai",
        semester: 5,
        academic_year: "2026-2027",
        credits: 4,
        lecture_count: 3,
        tutorial_count: 0,
        practical_count: 0,
        lecture_duration: 1.0,
        tutorial_duration: 1.0,
        practical_duration: 2.0,
        total_weekly_hours: 3.0,
        required_room_type: "classroom",
        assigned_teachers: ["F002"],
      },
      {
        id: "c-csai5-mll",
        course_code: "CSAI5-MLL",
        course_name: "ML Lab",
        department_id: "dept-csai",
        semester: 5,
        academic_year: "2026-2027",
        credits: 2,
        lecture_count: 0,
        tutorial_count: 0,
        practical_count: 1,
        lecture_duration: 1.0,
        tutorial_duration: 1.0,
        practical_duration: 2.0,
        total_weekly_hours: 2.0,
        required_room_type: "lab",
        required_lab_specialization: "General / DSA",
        assigned_teachers: ["F002"],
      },
    ];

    const sem5Batch: Batch[] = [
      { id: "b-csai5a", section_id: "CSAI-5-A", department_id: "dept-csai", semester: 5, section_name: "A", strength: 45, academic_year: "2026-2027" },
    ];

    const configWithSat: TimetableConfig = {
      ...config,
      working_days: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
    };

    const problem: SolverProblem = {
      courses: sem5Courses,
      teachers,
      teacherAvailability: [],
      rooms,
      batches: sem5Batch,
      config: configWithSat,
      targetBatchId: "CSAI-5-A",
    };

    const result = solveTimetable(problem);
    expect(result.success).toBe(true);
    // 3L+1T (DL) + 1P (DLL) + 3L (ML) + 1P (MLL) = 9 sessions
    expect(result.sessions.length).toBe(9);
    // Labs have 2 hours duration
    const labs = result.sessions.filter((s) => s.session_type === "lab");
    expect(labs.length).toBe(2);
    labs.forEach((lab) => {
      expect(lab.duration_hours).toBe(2);
    });
  });
});
