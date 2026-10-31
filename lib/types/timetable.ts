/**
 * TypeScript type definitions for the Timetable Maker module.
 * Mirrors the PostgreSQL database schema and solver contracts.
 */

export interface Department {
  id: string;
  code: string;
  name: string;
  hod_id?: string | null;
}

export interface Teacher {
  id: string;
  faculty_id: string; // e.g. 'F001'
  department_id: string;
  name: string;
  email?: string;
  designation: string;
  max_weekly_hours: number;
  max_daily_hours: number;
  is_active: boolean;
  courses_taught?: string[]; // IDs or codes of courses
}

export interface TeacherAvailability {
  id: string;
  teacher_id: string;
  day_of_week: "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat";
  start_time: string; // "HH:MM:SS" or "HH:MM"
  end_time: string;
  availability_type: "available" | "unavailable" | "preferred";
  reason?: string;
}

export interface Room {
  id: string;
  room_id: string; // e.g. 'CS-LAB-1'
  name: string;
  building: string;
  floor: number;
  room_type: "classroom" | "lab" | "seminar_hall" | "workshop" | "auditorium" | "equipment_pool";
  lab_specialization?: string | null;
  capacity: number;
  exclusive_use: boolean;
  department_id?: string | null;
  is_active: boolean;
}

export interface Course {
  id: string;
  course_code: string; // e.g. 'CSAI5-DL'
  course_name: string; // e.g. 'Deep Learning Fundamentals'
  department_id: string;
  semester: number;
  academic_year: string;
  credits: number;

  // L-T-P counts (weekly session frequencies)
  lecture_count: number; // L
  tutorial_count: number; // T
  practical_count: number; // P

  // Configurable session durations in hours
  lecture_duration: number; // e.g. 1.0
  tutorial_duration: number; // e.g. 1.0
  practical_duration: number; // e.g. 2.0 or 3.0

  // Total weekly teaching hours calculated as:
  // (lecture_count * lecture_duration) + (tutorial_count * tutorial_duration) + (practical_count * practical_duration)
  total_weekly_hours: number;

  required_room_type: string;
  required_lab_specialization?: string | null;
  assigned_teachers?: string[]; // teacher faculty_ids
}

export interface Batch {
  id: string;
  section_id: string; // e.g. 'CSE-3-A'
  department_id: string;
  semester: number;
  section_name: string;
  strength: number;
  academic_year: string;
  sub_groups?: StudentGroup[];
}

export interface StudentGroup {
  id: string;
  batch_id: string;
  group_name: string; // e.g. 'Batch A1'
  strength: number;
}

export interface BreakSlot {
  name: string;
  start: string; // "13:15"
  end: string;   // "14:00"
}

export interface PeriodSlotTemplate {
  id: string;
  period_number?: number;
  label: string; // e.g. "1st Class", "Break", "2nd Class", "Lunch", "Buffer Time"
  start_time: string; // "09:00"
  end_time: string; // "10:00"
  is_break: boolean;
  break_type?: "short" | "lunch" | "other";
  is_buffer?: boolean; // True for buffer / unmanaged transition gaps
}

export interface TimetableConfig {
  id: string;
  name: string;
  department_id?: string;
  working_days: ("Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat")[];
  day_start_time: string; // "08:00"
  day_end_time: string;   // "17:00"
  period_duration_minutes: number; // e.g. 60
  break_slots: BreakSlot[];
  period_slots?: PeriodSlotTemplate[];
  max_faculty_daily_hours: number;
}

export interface TimetableSession {
  id: string;
  version_id: string;
  course_id: string;
  course_code: string;
  course_name: string;
  teacher_id: string;
  teacher_name?: string;
  room_id: string;
  room_name?: string;
  batch_id: string;
  section_id: string;
  group_id?: string | null;
  group_name?: string | null;

  session_type: "theory" | "tutorial" | "lab";
  day_of_week: "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat";
  start_time: string; // "09:00"
  end_time: string;   // "10:00"
  duration_hours: number;
  is_locked: boolean;
}

export interface TimetableVersion {
  id: string;
  config_id: string;
  department_id: string;
  academic_year: string;
  semester_type: "odd" | "even" | "summer";
  version_number: number;
  name: string;
  status: "draft" | "analyzed" | "approved" | "published" | "archived";
  is_active: boolean;
  sessions?: TimetableSession[];
  solver_metadata?: {
    solve_duration_ms?: number;
    iterations?: number;
    soft_score?: number;
    hard_conflicts?: number;
  };
  created_at: string;
  updated_at: string;
}

export interface DiagnosticFinding {
  kind: "teacher_overload" | "room_shortage" | "batch_overbooked" | "lab_continuous_fail" | "hard_conflict";
  severity: "blocker" | "warning";
  entity_id: string;
  entity_name: string;
  message: string;
  suggestion?: string;
}

export interface DiagnosticReport {
  success: boolean;
  message: string;
  findings: DiagnosticFinding[];
  unscheduled_count: number;
}
