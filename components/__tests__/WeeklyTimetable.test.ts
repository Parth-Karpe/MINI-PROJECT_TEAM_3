import { describe, expect, it } from "vitest";
import { timetableStatus } from "../WeeklyTimetable";
import type { PublishedSession } from "@/lib/publishedTimetable";

const monday: PublishedSession = {
  entry_id: "one", branch: "CSE(AI)", semester: "5", section: "A", batch: "",
  day: "Mon", start_time: "09:00", end_time: "10:00",
  course_code: "CC", course_name: "Cloud Computing", session_type: "theory",
  faculty_id: "DK", faculty_name: "Dheeraj K", room_id: "CLH306", expected_students: 0,
};

describe("dashboard timetable clock", () => {
  it("uses inclusive starts and exclusive ends", () => {
    expect(timetableStatus(monday, "2026-11-16T08:59")).toBe("upcoming");
    expect(timetableStatus(monday, "2026-11-16T09:00")).toBe("running");
    expect(timetableStatus(monday, "2026-11-16T10:00")).toBe("completed");
    expect(timetableStatus({ ...monday, start_time: "10:00", end_time: "11:00" }, "2026-11-16T10:00")).toBe("running");
  });

  it("compares teaching days within the selected week", () => {
    expect(timetableStatus(monday, "2026-11-18T08:00")).toBe("completed");
    expect(timetableStatus({ ...monday, day: "Thu" }, "2026-11-18T16:00")).toBe("upcoming");
    expect(timetableStatus(monday, "2026-11-22T08:00")).toBe("completed");
    expect(timetableStatus(monday, "2026-11-23T08:00")).toBe("upcoming");
  });

  it("uses the dated occurrence or explicit one-off date", () => {
    expect(timetableStatus(monday, "2026-11-18T09:30", "2026-11-18")).toBe("running");
    expect(timetableStatus({ ...monday, _one_off_date: "2026-11-19" }, "2026-11-18T09:30", "2026-11-18")).toBe("upcoming");
  });
});
