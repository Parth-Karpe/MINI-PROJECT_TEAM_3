import { describe, expect, it } from "vitest";
import { isSlotOverlap, isRoomCompatible, isTeacherFree } from "../timetableSolver";
import type { SessionVariable, TimeSlot } from "../timetableSolver";
import type { Room, TeacherAvailability } from "../types/timetable";

describe("Timetable Move and Conflict Validation", () => {
  const sampleSlot1: TimeSlot = {
    day: "Mon",
    startHour: 9.0,
    endHour: 10.0,
    duration: 1.0,
    startTimeStr: "09:00",
    endTimeStr: "10:00",
  };

  const sampleSlot2Overlap: TimeSlot = {
    day: "Mon",
    startHour: 9.5,
    endHour: 10.5,
    duration: 1.0,
    startTimeStr: "09:30",
    endTimeStr: "10:30",
  };

  const sampleSlot3NonOverlap: TimeSlot = {
    day: "Mon",
    startHour: 10.0,
    endHour: 11.0,
    duration: 1.0,
    startTimeStr: "10:00",
    endTimeStr: "11:00",
  };

  const sampleSlotDifferentDay: TimeSlot = {
    day: "Tue",
    startHour: 9.0,
    endHour: 10.0,
    duration: 1.0,
    startTimeStr: "09:00",
    endTimeStr: "10:00",
  };

  it("detects temporal slot overlap correctly", () => {
    expect(isSlotOverlap(sampleSlot1, sampleSlot2Overlap)).toBe(true);
    expect(isSlotOverlap(sampleSlot1, sampleSlot3NonOverlap)).toBe(false);
    expect(isSlotOverlap(sampleSlot1, sampleSlotDifferentDay)).toBe(false);
  });

  it("validates room compatibility for practicals vs theory", () => {
    const theoryVar: SessionVariable = {
      varId: "v1",
      courseId: "c1",
      courseCode: "CSE3-DS",
      courseName: "Data Structures",
      sessionType: "theory",
      sessionNumber: 1,
      duration: 1.0,
      batchId: "b1",
      sectionId: "CSE-3-A",
      groupId: null,
      groupName: null,
      expectedStudents: 50,
      teacherId: "t1",
      teacherFacultyId: "F001",
      teacherName: "Dr. Rao",
      requiredRoomType: "classroom",
      requiredLabSpecialization: null,
      isLocked: false,
    };

    const labVar: SessionVariable = {
      ...theoryVar,
      sessionType: "lab",
      requiredRoomType: "lab",
      requiredLabSpecialization: "AI/ML GPU",
    };

    const classroom: Room = {
      id: "r1",
      room_id: "CS-101",
      name: "Classroom 101",
      building: "Block A",
      floor: 1,
      room_type: "classroom",
      capacity: 65,
      exclusive_use: true,
      is_active: true,
    };

    const gpuLab: Room = {
      id: "r2",
      room_id: "CS-LAB-2",
      name: "AI/ML Lab",
      building: "Block A",
      floor: 2,
      room_type: "lab",
      lab_specialization: "AI/ML GPU",
      capacity: 55,
      exclusive_use: true,
      is_active: true,
    };

    // Theory in classroom = valid
    expect(isRoomCompatible(theoryVar, classroom)).toBe(true);
    // Theory in lab = false
    expect(isRoomCompatible(theoryVar, gpuLab)).toBe(false);
    // Lab in classroom = false
    expect(isRoomCompatible(labVar, classroom)).toBe(false);
    // Lab in GPU lab = valid
    expect(isRoomCompatible(labVar, gpuLab)).toBe(true);
  });

  it("respects teacher unavailability restrictions", () => {
    const teacherAvail: TeacherAvailability[] = [
      {
        id: "a1",
        teacher_id: "t1",
        day_of_week: "Mon",
        start_time: "09:00:00",
        end_time: "11:00:00",
        availability_type: "unavailable",
      },
    ];

    // Mon 09:00-10:00 is unavailable
    expect(isTeacherFree("t1", sampleSlot1, teacherAvail)).toBe(false);
    // Tue 09:00-10:00 is free
    expect(isTeacherFree("t1", sampleSlotDifferentDay, teacherAvail)).toBe(true);
  });
});
