import { describe, expect, it } from "vitest";
import { generateCandidateTimeSlots, isValidPlacement, type SessionVariable, type TimeSlot } from "../timetableSolver";
import type { PeriodSlotTemplate, Room, Teacher, TeacherAvailability, TimetableConfig } from "../types/timetable";

describe("Buffer Time & Faculty 10/2 Quota Logic", () => {
  it("excludes buffer slots and break slots from candidate slot generation", () => {
    const periodSlots: PeriodSlotTemplate[] = [
      { id: "p1", period_number: 1, label: "1st Class", start_time: "09:00", end_time: "10:00", is_break: false },
      { id: "b1", label: "Break", start_time: "10:00", end_time: "10:15", is_break: true, break_type: "short" },
      { id: "p2", period_number: 2, label: "2nd Class", start_time: "10:15", end_time: "11:15", is_break: false },
      { id: "p3", period_number: 3, label: "3rd Class", start_time: "11:15", end_time: "12:15", is_break: false },
      // 15m unmanaged gap explicitly converted to buffer:
      { id: "buf1", label: "Buffer Time", start_time: "12:15", end_time: "12:30", is_break: false, is_buffer: true },
      { id: "lunch", label: "Lunch Break", start_time: "12:30", end_time: "13:30", is_break: true, break_type: "lunch" },
      { id: "p4", period_number: 4, label: "4th Class", start_time: "13:30", end_time: "14:30", is_break: false },
    ];

    const mockConfig: TimetableConfig = {
      id: "cfg-test",
      name: "Test Config",
      working_days: ["Mon"],
      day_start_time: "09:00",
      day_end_time: "17:00",
      period_duration_minutes: 60,
      break_slots: [],
      period_slots: periodSlots,
      max_faculty_daily_hours: 4,
    };

    const slots = generateCandidateTimeSlots(mockConfig, 1.0);

    // Should include 1st, 2nd, 3rd, 4th class
    expect(slots.length).toBe(4);
    expect(slots.map((s) => s.startTimeStr)).toEqual(["09:00", "10:15", "11:15", "13:30"]);

    // Must NOT contain 10:00 (Break), 12:15 (Buffer), or 12:30 (Lunch)
    expect(slots.some((s) => s.startTimeStr === "10:00")).toBe(false);
    expect(slots.some((s) => s.startTimeStr === "12:15")).toBe(false);
    expect(slots.some((s) => s.startTimeStr === "12:30")).toBe(false);
  });

  it("enforces faculty daily workload limit of max 2 hours per day", () => {
    const teacher: Teacher = {
      id: "t-1",
      faculty_id: "F001",
      name: "Dr. Smith",
      department_id: "dept-cse",
      designation: "Professor",
      max_weekly_hours: 10,
      max_daily_hours: 2,
      is_active: true,
    };

    const room: Room = {
      id: "r-1",
      room_id: "CR-1",
      name: "Classroom 1",
      building: "A",
      floor: 1,
      room_type: "classroom",
      capacity: 60,
      exclusive_use: true,
      is_active: true,
    };

    const var1: SessionVariable = {
      varId: "b1:c1:lec:1",
      courseId: "c1",
      courseCode: "CS101",
      courseName: "Programming",
      sessionType: "theory",
      sessionNumber: 1,
      duration: 1.0,
      batchId: "b1",
      sectionId: "CS-A",
      groupId: null,
      groupName: null,
      expectedStudents: 40,
      teacherId: "F001",
      teacherFacultyId: "F001",
      teacherName: "Dr. Smith",
      requiredRoomType: "classroom",
      requiredLabSpecialization: null,
      isLocked: false,
    };

    const slotMon9: TimeSlot = {
      day: "Mon",
      startHour: 9.0,
      endHour: 10.0,
      duration: 1.0,
      startTimeStr: "09:00",
      endTimeStr: "10:00",
    };

    const slotMon10: TimeSlot = {
      day: "Mon",
      startHour: 10.25,
      endHour: 11.25,
      duration: 1.0,
      startTimeStr: "10:15",
      endTimeStr: "11:15",
    };

    const slotMon13: TimeSlot = {
      day: "Mon",
      startHour: 13.0,
      endHour: 14.0,
      duration: 1.0,
      startTimeStr: "13:00",
      endTimeStr: "14:00",
    };

    // 1st placement on Monday (1h) - valid
    const check1 = isValidPlacement(var1, slotMon9, room, [], [teacher], []);
    expect(check1.valid).toBe(true);

    const placed1 = [{ variable: var1, slot: slotMon9, room }];

    // 2nd placement on Monday (total 2h) - valid
    const check2 = isValidPlacement(var1, slotMon10, room, placed1, [teacher], []);
    expect(check2.valid).toBe(true);

    const placed2 = [...placed1, { variable: var1, slot: slotMon10, room }];

    // 3rd placement on Monday (total 3h > max 2h) - should be REJECTED!
    const check3 = isValidPlacement(var1, slotMon13, room, placed2, [teacher], []);
    expect(check3.valid).toBe(false);
    expect(check3.reason).toContain("exceeds daily limit (2h) on Mon");
  });

  it("enforces faculty weekly workload limit of max 10 hours per week", () => {
    const teacher: Teacher = {
      id: "t-1",
      faculty_id: "F001",
      name: "Dr. Smith",
      department_id: "dept-cse",
      designation: "Professor",
      max_weekly_hours: 10,
      max_daily_hours: 2,
      is_active: true,
    };

    const room: Room = {
      id: "r-1",
      room_id: "CR-1",
      name: "Classroom 1",
      building: "A",
      floor: 1,
      room_type: "classroom",
      capacity: 60,
      exclusive_use: true,
      is_active: true,
    };

    const var1: SessionVariable = {
      varId: "b1:c1:lec:1",
      courseId: "c1",
      courseCode: "CS101",
      courseName: "Programming",
      sessionType: "theory",
      sessionNumber: 1,
      duration: 1.0,
      batchId: "b1",
      sectionId: "CS-A",
      groupId: null,
      groupName: null,
      expectedStudents: 40,
      teacherId: "F001",
      teacherFacultyId: "F001",
      teacherName: "Dr. Smith",
      requiredRoomType: "classroom",
      requiredLabSpecialization: null,
      isLocked: false,
    };

    // Placed 10 hours across 5 days (2h each day Mon-Fri = 10h)
    const days = ["Mon", "Tue", "Wed", "Thu", "Fri"] as const;
    const placed: any[] = [];
    for (const d of days) {
      placed.push({
        variable: var1,
        slot: { day: d, startHour: 9.0, endHour: 10.0, duration: 1.0, startTimeStr: "09:00", endTimeStr: "10:00" },
        room,
      });
      placed.push({
        variable: var1,
        slot: { day: d, startHour: 10.25, endHour: 11.25, duration: 1.0, startTimeStr: "10:15", endTimeStr: "11:15" },
        room,
      });
    }

    expect(placed.length).toBe(10); // 10 hours

    // Try placing an 11th hour on Saturday:
    const slotSat: TimeSlot = {
      day: "Sat",
      startHour: 9.0,
      endHour: 10.0,
      duration: 1.0,
      startTimeStr: "09:00",
      endTimeStr: "10:00",
    };

    const check = isValidPlacement(var1, slotSat, room, placed, [teacher], []);
    expect(check.valid).toBe(false);
    expect(check.reason).toContain("exceeds weekly limit (10h)");
  });
});
