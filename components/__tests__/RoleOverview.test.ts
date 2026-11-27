import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DepartmentTimetable, RoomUtilChart, TodaySchedule, WeeklySessionsChart } from "../RoleOverview";
import { WeeklyTimetable } from "../WeeklyTimetable";
import type { PublishedSession } from "@/lib/publishedTimetable";

const row = (id: string, start: string, end: string, extra: Partial<PublishedSession> = {}): PublishedSession => ({
  entry_id: id, day: "Fri", start_time: start, end_time: end, branch: "CSE-AI", semester: "5", section: "A", batch: "",
  course_code: id, course_name: `Course ${id}`, session_type: "theory", faculty_id: "AK", faculty_name: "Amit K", room_id: "LHC306", expected_students: 60, ...extra,
});
const today = (rows: PublishedSession[], clock: string, published = true) =>
  renderToStaticMarkup(createElement(TodaySchedule, { rows, clock, date: "2026-11-27", role: "student", published }));

describe("Today section", () => {
  const rows = [row("PGC", "11:30", "12:30"), row("DL", "09:00", "10:00"), row("LAB", "14:00", "16:00", { batch: "A1", session_type: "lab", room_id: "LAB201" })];

  it("lists classes in time order and highlights only the next upcoming one", () => {
    const html = today(rows, "2026-11-27T10:30");
    expect(html.indexOf("Course DL")).toBeLessThan(html.indexOf("Course PGC"));
    expect(html.indexOf("Course PGC")).toBeLessThan(html.indexOf("Course LAB"));
    expect(html.match(/ov-next/g)).toHaveLength(1);
    expect(html).toMatch(/ov-next"[^>]*>.*Course PGC/);
    expect(html).toContain("Batch A1");
    expect(html).toContain("LAB201");
  });
  it("marks a running class as Now", () => {
    expect(today(rows, "2026-11-27T09:15")).toContain(">Now<");
  });
  it("shows clear empty states", () => {
    expect(today(rows, "2026-11-27T16:30")).toContain("No more classes today.");
    expect(today([], "2026-11-27T09:00")).toContain("No classes scheduled today.");
    expect(today([], "2026-11-27T09:00", false)).toContain("not been published");
  });
});

describe("HOD overview charts", () => {
  const week = [row("A", "09:00", "10:00", { day: "Mon" }), row("B", "10:15", "11:15", { day: "Mon" }), row("C", "09:00", "11:00", { day: "Tue" })];
  it("counts sessions per day from the published rows and labels only the busiest day", () => {
    const html = renderToStaticMarkup(createElement(WeeklySessionsChart, { rows: week }));
    expect(html).toContain("Monday: 2 sessions, 2.0 h");
    expect(html).toContain("Tuesday: 1 sessions, 2.0 h");
    expect(html).toContain("Saturday: 0 sessions");
    expect(html.match(/ov-col-label/g)).toHaveLength(1);
    expect(html).toContain("3 sessions · 4.0 h a week");
  });
  it("ranks rooms by utilisation and leaves out workstations", () => {
    const html = renderToStaticMarkup(createElement(RoomUtilChart, {
      utilization: { LHC306: 40, LAB201: 75, "LAB201-PC01": 10 }, resources: [{ id: "LAB201-PC01", type: "workstation", parent: "LAB201" }],
    }));
    expect(html.indexOf("LAB201:")).toBeLessThan(html.indexOf("LHC306:"));
    expect(html).not.toContain("LAB201-PC01");
    expect(html).toContain("Average 58%");
  });
  it("shows empty states without data", () => {
    expect(renderToStaticMarkup(createElement(WeeklySessionsChart, { rows: [] }))).toContain("once a timetable is published");
    expect(renderToStaticMarkup(createElement(RoomUtilChart, { utilization: {}, resources: [] }))).toContain("Utilisation appears");
    expect(renderToStaticMarkup(createElement(DepartmentTimetable, { rows: [], clock: "2026-11-27T10:00" }))).toContain("No published timetable yet");
  });
  it("shows every class timetable at once, without a selector", () => {
    const html = renderToStaticMarkup(createElement(DepartmentTimetable, { rows: [row("X", "09:00", "10:00", { section: "B" }), row("Y", "09:00", "10:00")], clock: "2026-11-27T10:00" }));
    expect(html).toContain("Division A");
    expect(html).toContain("Division B");
    expect(html).not.toContain("<select");
    expect(html).toContain("2 classes");
    expect(html).toContain("<details>");
  });
});

describe("HOD department timetable", () => {
  it("uses the same triangle disclosure as the student view", () => {
    const html = renderToStaticMarkup(createElement(WeeklyTimetable, { rows: [row("DL", "09:00", "10:00")], expandable: true }));
    expect(html).toContain("<details>");
    expect(html).toContain("weekly-expandable");
    expect(html).not.toContain("weekly-compact");
    expect(html).toMatch(/<summary[^>]*>.*DL.*LHC306 · AK/);
    expect(html).toContain("Course DL");
  });
  it("leaves the default (non-expandable) table unchanged", () => {
    expect(renderToStaticMarkup(createElement(WeeklyTimetable, { rows: [row("DL", "09:00", "10:00")] }))).not.toContain("<details>");
  });
});
