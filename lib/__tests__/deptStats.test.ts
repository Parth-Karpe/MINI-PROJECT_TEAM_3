import { describe, expect, it } from "vitest";
import type { PublishedSession } from "../publishedTimetable";
import {
  ALL, WEEK_ROOM_HOURS, buildProfile, computeBusiestDay, computeClasses, computeDeptStats, computeFaculty, computeHeat,
  computePeak, computeRooms, csvCell, exportTable, groupRooms, initialsOf, jain, mergeIntervals, toCsv,
} from "../deptStats";

let n = 0;
const s = (o: Partial<PublishedSession>): PublishedSession => ({
  entry_id: `E${++n}`, day: "Mon", start_time: "09:00", end_time: "10:00", branch: "CSE-AI", semester: "5", section: "A", batch: "",
  course_code: "C1", course_name: "Course 1", session_type: "theory", faculty_id: "AK", faculty_name: "Amit K", room_id: "R1", expected_students: 0, ...o,
});

describe("primitives", () => {
  it("merges touching and overlapping intervals", () => {
    expect(mergeIntervals([[600, 660], [540, 600], [700, 720], [710, 730]])).toEqual([[540, 660], [700, 730]]);
  });
  it("computes Jain's index", () => {
    expect(jain([10, 10, 10])).toBeCloseTo(1);
    expect(jain([30, 0, 0])).toBeCloseTo(1 / 3);
    expect(jain([5])).toBeNull();
    expect(jain([0, 0])).toBeNull();
  });
  it("derives initials, skipping titles", () => {
    expect(initialsOf("Dr. Ananya Rao", "F001")).toBe("AR");
    expect(initialsOf("Amit K", "AK")).toBe("AK");
    expect(initialsOf("SV", "SV")).toBe("SV");
  });
  it("neutralises spreadsheet formulas and quotes commas", () => {
    expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvCell("-5")).toBe("-5");
    expect(csvCell('a,"b"')).toBe('"a,""b"""');
    expect(toCsv([["a", 1]])).toBe("a,1\r\n");
  });
});

describe("profile", () => {
  it("splits time around lunch and shades partial hours", () => {
    const p = buildProfile([s({ start_time: "10:15", end_time: "11:15" }), s({ start_time: "13:30", end_time: "15:30" })]);
    expect(p.hours).toBe(3);
    expect(p.morningMin).toBe(60);
    expect(p.afternoonMin).toBe(120);
    expect(p.grid[0][2].minutes).toBe(45); // 10:00–11:00
    expect(p.grid[0][3].minutes).toBe(15); // 11:00–12:00
    expect(p.grid[0][5].minutes).toBe(30); // 13:00–14:00
  });
  it("does not double count overlapping sessions but reports the clash", () => {
    const p = buildProfile([s({}), s({ start_time: "09:30", end_time: "10:30" })]);
    expect(p.hours).toBe(1.5);
    expect(p.clashes).toBe(1);
  });
  it("finds free periods but ignores tea breaks and lunch", () => {
    const p = buildProfile([
      s({ start_time: "09:00", end_time: "10:00" }), s({ start_time: "10:15", end_time: "11:15" }), // 15 min tea
      s({ start_time: "11:30", end_time: "12:30" }), s({ start_time: "13:30", end_time: "14:30" }), // lunch
      s({ start_time: "15:45", end_time: "16:45" }), // 14:30–15:45 minus 15:30–15:45 break = 60 min
    ]);
    expect(p.gaps[0]).toEqual([[870, 930]]);
    expect(p.gapMinutes).toBe(60);
  });
  it("measures the longest stretch across short breaks", () => {
    const p = buildProfile([
      s({ start_time: "09:00", end_time: "10:00" }), s({ start_time: "10:15", end_time: "11:15" }),
      s({ start_time: "11:30", end_time: "12:30" }), s({ start_time: "13:30", end_time: "14:30" }),
    ]);
    expect(p.longest).toEqual({ day: 0, start: 540, end: 750, teaching: 180 });
  });
});

describe("faculty", () => {
  const rows = [
    s({ faculty_id: "AK", faculty_name: "Amit K", day: "Mon" }), s({ faculty_id: "AK", faculty_name: "Amit K", day: "Tue" }),
    s({ faculty_id: "SV", faculty_name: "Sneha V", day: "Mon", start_time: "10:15", end_time: "11:15", room_id: "R2" }),
    s({ faculty_id: "SV;PS", faculty_name: "Sneha V;Pooja S", day: "Tue", start_time: "10:15", end_time: "12:15", room_id: "R2" }),
  ];
  it("counts a co-taught session for each teacher and resolves names", () => {
    const { list } = computeFaculty(rows);
    expect(list.map(f => f.id).sort()).toEqual(["AK", "PS", "SV"]);
    expect(list.find(f => f.id === "PS")?.name).toBe("Pooja S");
    expect(list.find(f => f.id === "SV")?.hours).toBe(3);
  });
  it("flags a mostly-morning teacher only past the minimum hours", () => {
    const heavy = Array.from({ length: 5 }, (_, i) => s({ faculty_id: "SV", day: ["Mon", "Tue", "Wed", "Thu", "Fri"][i], start_time: "09:00", end_time: "10:00" }));
    const light = computeFaculty([s({ faculty_id: "ZZ" })]).list[0];
    expect(light.flags).toHaveLength(0);
    const f = computeFaculty([...heavy, s({ faculty_id: "AK", start_time: "13:30", end_time: "14:30" })]).list.find(x => x.id === "SV")!;
    expect(f.flags.some(x => x.id === "morning")).toBe(true);
  });
});

describe("rooms", () => {
  it("uses the 54-hour week and flags the extremes", () => {
    const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const full = days.flatMap(d => [s({ day: d, room_id: "LAB6", start_time: "08:00", end_time: "17:00", session_type: "lab" })]);
    const quiet = [s({ room_id: "LHC9" })];
    const rooms = computeRooms([...full, ...quiet]);
    expect(rooms[0].id).toBe("LAB6");
    expect(rooms[0].util).toBeCloseTo(1);
    expect(rooms[0].severity).toBe("problem");
    expect(rooms[0].group).toBe("Labs");
    expect(rooms[1].util).toBeCloseTo(1 / WEEK_ROOM_HOURS);
    expect(rooms[1].severity).toBe("watch");
    expect(groupRooms(rooms).map(g => g.group)).toEqual(["Labs", "Classrooms"]);
  });
  it("prefers a declared type over inference", () => {
    const [r] = computeRooms([s({ room_id: "X1", room_type: "hall" })]);
    expect(r.group).toBe("Halls");
    expect(r.inferred).toBe(false);
  });
});

describe("classes", () => {
  it("builds one card per section with batches side by side", () => {
    const rows = [
      s({}), s({ day: "Tue", batch: "A1", session_type: "lab", start_time: "13:30", end_time: "15:30" }),
      s({ day: "Wed", batch: "A2", session_type: "lab", start_time: "13:30", end_time: "15:30" }), s({ section: "B", batch: "" }),
    ];
    const cards = computeClasses(rows);
    expect(cards.map(c => c.key)).toEqual(["5:A", "5:B"]);
    expect(cards[0].units.map(u => u.label)).toEqual(["A1", "A2"]);
    expect(cards[0].units[0].profile.hours).toBe(3); // whole-section theory + A1 lab
    expect(cards[1].units[0].label).toBe("Whole section");
  });
});

describe("overview", () => {
  const rows = [
    s({ day: "Mon", start_time: "10:15", end_time: "11:15" }), s({ day: "Mon", start_time: "10:15", end_time: "11:15", room_id: "R2", faculty_id: "SV" }),
    s({ day: "Tue", start_time: "10:15", end_time: "11:15", room_id: "R3", faculty_id: "PS" }),
  ];
  it("counts sessions, rooms and faculty per hour cell", () => {
    const { cells, max } = computeHeat(rows);
    expect(cells[0][2]).toMatchObject({ sessions: 2, rooms: 2, faculty: 2 });
    expect(cells[0][3].sessions).toBe(2); // 11:00–12:00 still overlaps 10:15–11:15
    expect(cells[0][0].sessions).toBe(0);
    expect(max).toBe(2);
  });
  it("finds the busiest day and the 15-minute peak", () => {
    expect(computeBusiestDay(rows).busiest?.day).toBe(0);
    expect(computePeak(rows)).toMatchObject({ start: 615, end: 675, total: 3 });
  });
  it("returns nothing for an empty timetable", () => {
    expect(computePeak([])).toBeNull();
    expect(computeBusiestDay([]).busiest).toBeNull();
  });
});

describe("insights", () => {
  it("gives one chip per person with the extra flags counted", () => {
    const days = ["Mon", "Tue", "Wed", "Thu", "Fri"];
    const heavy = days.flatMap((d, i) => [s({ faculty_id: "AK", day: d, start_time: "09:00", end_time: "10:00", room_id: "R" + i }), s({ faculty_id: "AK", day: d, start_time: "10:15", end_time: "11:15", room_id: "R" + i }), s({ faculty_id: "AK", day: d, start_time: "11:30", end_time: "12:30", room_id: "R" + i })]);
    const others = ["SV", "PS", "DK"].map(id => s({ faculty_id: id, faculty_name: id, day: "Sat", start_time: "13:30", end_time: "14:30", room_id: "RZ" + id }));
    const stats = computeDeptStats([...heavy, ...others], { semester: ALL, section: ALL });
    const ak = stats.insights.filter(i => i.id === "f:AK");
    expect(ak).toHaveLength(1);
    expect(ak[0].severity).toBe("problem");
    expect(ak[0].text).toMatch(/\+\d+/);
    expect(stats.attention.count).toBe(stats.insights.filter(i => i.severity !== "ok").length);
  });
});

describe("computeDeptStats", () => {
  const rows = [s({ semester: "5", room_id: "R1" }), s({ semester: "3", faculty_id: "SV", faculty_name: "Sneha V", day: "Tue", room_id: "R2" })];
  it("filters teaching views but keeps rooms department-wide", () => {
    const all = computeDeptStats(rows, { semester: ALL, section: ALL });
    const sem5 = computeDeptStats(rows, { semester: "5", section: ALL });
    expect(all.faculty.list).toHaveLength(2);
    expect(sem5.faculty.list).toHaveLength(1);
    expect(sem5.rooms).toHaveLength(2);
    expect(sem5.roomUse).toBe(all.roomUse);
  });
  it("exports the rows behind each tab", () => {
    const stats = computeDeptStats(rows, { semester: ALL, section: ALL });
    expect(exportTable("faculty", stats)[0][0]).toBe("faculty_id");
    expect(exportTable("rooms", stats)).toHaveLength(3);
    expect(exportTable("overview", stats)).toHaveLength(1 + 6 * 9);
    expect(exportTable("classes", stats)[1][0]).toBe("3");
  });
});
