import { describe, expect, it } from "vitest";
import { calculateWeeklyTeachingHours, expandLTPSessions, formatLTP } from "../ltp";

describe("L-T-P Contact Hours & Session Expansion", () => {
  it("calculates standard 3-1-2 course correctly (8.0 weekly hours)", () => {
    const params = {
      lecture_count: 3,
      lecture_duration: 1.0,
      tutorial_count: 1,
      tutorial_duration: 1.0,
      practical_count: 2,
      practical_duration: 2.0,
    };
    const hours = calculateWeeklyTeachingHours(params);
    expect(hours).toBe(8.0);
    expect(formatLTP(params)).toBe("3-1-2 (8 hrs/wk)");

    const sessions = expandLTPSessions(params);
    expect(sessions.length).toBe(6);
    expect(sessions.filter((s) => s.session_type === "theory").length).toBe(3);
    expect(sessions.filter((s) => s.session_type === "tutorial").length).toBe(1);
    expect(sessions.filter((s) => s.session_type === "lab").length).toBe(2);
    expect(sessions.find((s) => s.session_type === "lab")?.duration_hours).toBe(2.0);
  });

  it("handles pure theory 4-0-0 course", () => {
    const params = {
      lecture_count: 4,
      lecture_duration: 1.0,
      tutorial_count: 0,
      tutorial_duration: 1.0,
      practical_count: 0,
      practical_duration: 2.0,
    };
    expect(calculateWeeklyTeachingHours(params)).toBe(4.0);
    const sessions = expandLTPSessions(params);
    expect(sessions.length).toBe(4);
    expect(sessions.every((s) => s.session_type === "theory")).toBe(true);
  });

  it("handles lab-only course with 3-hour practical session", () => {
    const params = {
      lecture_count: 0,
      lecture_duration: 1.0,
      tutorial_count: 0,
      tutorial_duration: 1.0,
      practical_count: 1,
      practical_duration: 3.0,
    };
    expect(calculateWeeklyTeachingHours(params)).toBe(3.0);
    const sessions = expandLTPSessions(params);
    expect(sessions.length).toBe(1);
    expect(sessions[0].session_type === "lab").toBe(true);
    expect(sessions[0].duration_hours).toBe(3.0);
  });

  it("handles fractional durations e.g. 1.5h sessions", () => {
    const params = {
      lecture_count: 2,
      lecture_duration: 1.5,
      tutorial_count: 1,
      tutorial_duration: 0.5,
      practical_count: 1,
      practical_duration: 2.5,
    };
    // 2 * 1.5 + 1 * 0.5 + 1 * 2.5 = 3 + 0.5 + 2.5 = 6.0
    expect(calculateWeeklyTeachingHours(params)).toBe(6.0);
  });
});
