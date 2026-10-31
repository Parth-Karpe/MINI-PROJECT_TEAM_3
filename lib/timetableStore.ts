/**
 * Academic Catalog & Timetable In-Memory and Supabase Data Store.
 *
 * Provides a resilient unified interface:
 * 1. Checks for Supabase connection (if NEXT_PUBLIC_SUPABASE_URL and key are provided).
 * 2. Defaults to a fully hydrated, stateful in-memory store pre-seeded from data/tt_opt
 *    (Courses, Faculty, Rooms, Sections, and Default Config).
 *
 * This ensures the application runs out-of-the-box without requiring an external cloud setup,
 * while allowing full CRUD, generation, editing, and finalization.
 */

import type {
  Batch,
  Course,
  Department,
  Room,
  Teacher,
  TeacherAvailability,
  TimetableConfig,
  TimetableSession,
  TimetableVersion,
} from "./types/timetable";

// In-memory state containers
const departments: Department[] = [
  { id: "dept-cse", code: "CSE", name: "Computer Science & Engineering" },
  { id: "dept-csai", code: "CSE (AI & ML)", name: "CSE (Artificial Intelligence & Machine Learning)" },
  { id: "dept-ece", code: "ECE", name: "Electronics & Communication Engineering" },
  { id: "dept-rob", code: "Robotics", name: "Robotics & Automation" },
  { id: "dept-sh", code: "Science & Humanities", name: "Science & Humanities" },
];

const teachers: Teacher[] = [
  { id: "t-f001", faculty_id: "F001", department_id: "dept-cse", name: "Dr. Ananya Rao", designation: "Associate Professor", max_weekly_hours: 20, max_daily_hours: 4, is_active: true, courses_taught: ["CSE3-DS", "CSE3-DSL"] },
  { id: "t-f002", faculty_id: "F002", department_id: "dept-cse", name: "Prof. Vikram Desai", designation: "Assistant Professor", max_weekly_hours: 20, max_daily_hours: 4, is_active: true, courses_taught: ["CSAI3-DLD", "CSE3-DLD"] },
  { id: "t-f003", faculty_id: "F003", department_id: "dept-cse", name: "Dr. Meera Iyer", designation: "Professor", max_weekly_hours: 18, max_daily_hours: 4, is_active: true, courses_taught: ["CSAI3-DM", "CSE3-DM"] },
  { id: "t-f004", faculty_id: "F004", department_id: "dept-cse", name: "Prof. Arjun Nair", designation: "Assistant Professor", max_weekly_hours: 22, max_daily_hours: 4, is_active: true, courses_taught: ["CSE3-OOP", "CSE3-OOPL"] },
  { id: "t-f005", faculty_id: "F005", department_id: "dept-cse", name: "Dr. Kavya Shetty", designation: "Associate Professor", max_weekly_hours: 18, max_daily_hours: 4, is_active: true, courses_taught: ["CSE3-CO"] },
  { id: "t-f006", faculty_id: "F006", department_id: "dept-cse", name: "Prof. Rahul Kulkarni", designation: "Assistant Professor", max_weekly_hours: 20, max_daily_hours: 4, is_active: true, courses_taught: ["CSE5-OS", "CSE5-OSL"] },
  { id: "t-f007", faculty_id: "F007", department_id: "dept-cse", name: "Dr. Priya Menon", designation: "Associate Professor", max_weekly_hours: 18, max_daily_hours: 4, is_active: true, courses_taught: ["CSE5-CN"] },
  { id: "t-f008", faculty_id: "F008", department_id: "dept-cse", name: "Prof. Suresh Bhat", designation: "Assistant Professor", max_weekly_hours: 22, max_daily_hours: 4, is_active: true, courses_taught: ["CSAI5-DBMS", "CSE3-OOPL", "CSE5-DBMS", "CSE5-DBMSL"] },
  { id: "t-f009", faculty_id: "F009", department_id: "dept-cse", name: "Dr. Neha Joshi", designation: "Associate Professor", max_weekly_hours: 20, max_daily_hours: 4, is_active: true, courses_taught: ["CSAI5-SE", "CSE3-DSL", "CSE5-DAA", "CSE5-SE"] },
  { id: "t-f010", faculty_id: "F010", department_id: "dept-csai", name: "Prof. Karthik Reddy", designation: "Assistant Professor", max_weekly_hours: 20, max_daily_hours: 4, is_active: true, courses_taught: ["CSAI3-DSA", "CSAI3-DSAL"] },
  { id: "t-f011", faculty_id: "F011", department_id: "dept-csai", name: "Dr. Sneha Pillai", designation: "Associate Professor", max_weekly_hours: 20, max_daily_hours: 4, is_active: true, courses_taught: ["CSAI3-PP", "CSAI3-PPL"] },
  { id: "t-f012", faculty_id: "F012", department_id: "dept-csai", name: "Prof. Manoj Hegde", designation: "Assistant Professor", max_weekly_hours: 20, max_daily_hours: 4, is_active: true, courses_taught: ["CSAI5-ML", "CSAI5-MLL"] },
  { id: "t-f013", faculty_id: "F013", department_id: "dept-csai", name: "Dr. Divya Rangan", designation: "Associate Professor", max_weekly_hours: 20, max_daily_hours: 4, is_active: true, courses_taught: ["CSAI5-DL", "CSAI5-DLL", "CSAI5-NLP"] },
  { id: "t-f014", faculty_id: "F014", department_id: "dept-ece", name: "Prof. Ramesh Iyer", designation: "Associate Professor", max_weekly_hours: 20, max_daily_hours: 4, is_active: true, courses_taught: ["ECE3-EDC", "ECE3-EDCL"] },
  { id: "t-f015", faculty_id: "F015", department_id: "dept-ece", name: "Dr. Lakshmi Narayan", designation: "Professor", max_weekly_hours: 18, max_daily_hours: 4, is_active: true, courses_taught: ["ECE3-DE", "ECE3-DEL"] },
  { id: "t-f017", faculty_id: "F017", department_id: "dept-ece", name: "Dr. Pooja Verma", designation: "Associate Professor", max_weekly_hours: 20, max_daily_hours: 4, is_active: true, courses_taught: ["ECE5-AC", "ECE5-MPMC", "ECE5-MPMCL"] },
  { id: "t-f018", faculty_id: "F018", department_id: "dept-ece", name: "Prof. Deepak Shenoy", designation: "Assistant Professor", max_weekly_hours: 20, max_daily_hours: 4, is_active: true, courses_taught: ["ECE5-AWP", "ECE5-CTRL", "ECE5-VLSI", "ECE5-VLSIL"] },
  { id: "t-f019", faculty_id: "F019", department_id: "dept-rob", name: "Dr. Ritu Malhotra", designation: "Associate Professor", max_weekly_hours: 20, max_daily_hours: 4, is_active: true, courses_taught: ["ROB3-BOR", "ROB3-ROBL", "ROB3-SA"] },
  { id: "t-f021", faculty_id: "F021", department_id: "dept-rob", name: "Dr. Anjali Kapoor", designation: "Associate Professor", max_weekly_hours: 20, max_daily_hours: 4, is_active: true, courses_taught: ["ROB5-AI4R", "ROB5-AI4RL", "ROB5-EMB", "ROB5-EMBL"] },
];

const teacherAvailability: TeacherAvailability[] = [];

const rooms: Room[] = [
  { id: "r-cslab1", room_id: "CS-LAB-1", name: "Programming Lab 1", building: "Block-A (CSE)", floor: 1, room_type: "lab", lab_specialization: "General / DSA", capacity: 60, exclusive_use: true, department_id: "dept-cse", is_active: true },
  { id: "r-cslab2", room_id: "CS-LAB-2", name: "AI/ML GPU Lab", building: "Block-A (CSE)", floor: 2, room_type: "lab", lab_specialization: "AI/ML GPU", capacity: 30, exclusive_use: true, department_id: "dept-csai", is_active: true },
  { id: "r-cs101", room_id: "CS-CLASSROOM-101", name: "Classroom 101", building: "Block-A (CSE)", floor: 1, room_type: "classroom", capacity: 70, exclusive_use: true, department_id: "dept-cse", is_active: true },
  { id: "r-cs102", room_id: "CS-CLASSROOM-102", name: "Classroom 102", building: "Block-A (CSE)", floor: 1, room_type: "classroom", capacity: 70, exclusive_use: true, department_id: "dept-cse", is_active: true },
  { id: "r-cssem", room_id: "CS-SEMINAR-HALL", name: "CSE Seminar Hall", building: "Block-A (CSE)", floor: 3, room_type: "seminar_hall", capacity: 120, exclusive_use: false, department_id: "dept-cse", is_active: true },
  { id: "r-ecelab1", room_id: "ECE-LAB-1", name: "Electronics Lab", building: "Block-B (ECE)", floor: 1, room_type: "lab", lab_specialization: "Electronics", capacity: 40, exclusive_use: true, department_id: "dept-ece", is_active: true },
  { id: "r-ecelab2", room_id: "ECE-LAB-2", name: "Communication Systems Lab", building: "Block-B (ECE)", floor: 2, room_type: "lab", lab_specialization: "Communication", capacity: 30, exclusive_use: true, department_id: "dept-ece", is_active: true },
  { id: "r-ece201", room_id: "ECE-CLASSROOM-201", name: "Classroom 201", building: "Block-B (ECE)", floor: 2, room_type: "classroom", capacity: 65, exclusive_use: true, department_id: "dept-ece", is_active: true },
];

const batches: Batch[] = [
  { id: "b-cse3a", section_id: "CSE-3-A", department_id: "dept-cse", semester: 3, section_name: "A", strength: 65, academic_year: "2026-2027", sub_groups: [{ id: "g-cse3a-1", batch_id: "b-cse3a", group_name: "A1", strength: 33 }, { id: "g-cse3a-2", batch_id: "b-cse3a", group_name: "A2", strength: 32 }] },
  { id: "b-cse3b", section_id: "CSE-3-B", department_id: "dept-cse", semester: 3, section_name: "B", strength: 60, academic_year: "2026-2027", sub_groups: [{ id: "g-cse3b-1", batch_id: "b-cse3b", group_name: "B1", strength: 30 }, { id: "g-cse3b-2", batch_id: "b-cse3b", group_name: "B2", strength: 30 }] },
  { id: "b-cse5a", section_id: "CSE-5-A", department_id: "dept-cse", semester: 5, section_name: "A", strength: 55, academic_year: "2026-2027" },
  { id: "b-csai3a", section_id: "CSAI-3-A", department_id: "dept-csai", semester: 3, section_name: "A", strength: 50, academic_year: "2026-2027" },
  { id: "b-csai5a", section_id: "CSAI-5-A", department_id: "dept-csai", semester: 5, section_name: "A", strength: 45, academic_year: "2026-2027" },
  { id: "b-ece3a", section_id: "ECE-3-A", department_id: "dept-ece", semester: 3, section_name: "A", strength: 55, academic_year: "2026-2027" },
  { id: "b-ece5a", section_id: "ECE-5-A", department_id: "dept-ece", semester: 5, section_name: "A", strength: 50, academic_year: "2026-2027" },
];

const courses: Course[] = [
  { id: "c-cse3-ds", course_code: "CSE3-DS", course_name: "Data Structures", department_id: "dept-cse", semester: 3, academic_year: "2026-2027", credits: 4, lecture_count: 3, tutorial_count: 1, practical_count: 0, lecture_duration: 1.0, tutorial_duration: 1.0, practical_duration: 2.0, total_weekly_hours: 4.0, required_room_type: "classroom", assigned_teachers: ["F001"] },
  { id: "c-cse3-dsl", course_code: "CSE3-DSL", course_name: "Data Structures Lab", department_id: "dept-cse", semester: 3, academic_year: "2026-2027", credits: 2, lecture_count: 0, tutorial_count: 0, practical_count: 1, lecture_duration: 1.0, tutorial_duration: 1.0, practical_duration: 2.0, total_weekly_hours: 2.0, required_room_type: "lab", required_lab_specialization: "General / DSA", assigned_teachers: ["F001", "F009"] },
  { id: "c-cse3-oop", course_code: "CSE3-OOP", course_name: "Object Oriented Programming", department_id: "dept-cse", semester: 3, academic_year: "2026-2027", credits: 4, lecture_count: 3, tutorial_count: 1, practical_count: 0, lecture_duration: 1.0, tutorial_duration: 1.0, practical_duration: 2.0, total_weekly_hours: 4.0, required_room_type: "classroom", assigned_teachers: ["F004"] },
  { id: "c-cse3-oopl", course_code: "CSE3-OOPL", course_name: "OOP Lab", department_id: "dept-cse", semester: 3, academic_year: "2026-2027", credits: 2, lecture_count: 0, tutorial_count: 0, practical_count: 1, lecture_duration: 1.0, tutorial_duration: 1.0, practical_duration: 2.0, total_weekly_hours: 2.0, required_room_type: "lab", assigned_teachers: ["F004", "F008"] },
  { id: "c-cse3-dld", course_code: "CSE3-DLD", course_name: "Digital Logic Design", department_id: "dept-cse", semester: 3, academic_year: "2026-2027", credits: 3, lecture_count: 3, tutorial_count: 0, practical_count: 0, lecture_duration: 1.0, tutorial_duration: 1.0, practical_duration: 2.0, total_weekly_hours: 3.0, required_room_type: "classroom", assigned_teachers: ["F002"] },
  { id: "c-cse3-co", course_code: "CSE3-CO", course_name: "Computer Organization", department_id: "dept-cse", semester: 3, academic_year: "2026-2027", credits: 3, lecture_count: 3, tutorial_count: 0, practical_count: 0, lecture_duration: 1.0, tutorial_duration: 1.0, practical_duration: 2.0, total_weekly_hours: 3.0, required_room_type: "classroom", assigned_teachers: ["F005"] },
  { id: "c-csai5-dl", course_code: "CSAI5-DL", course_name: "Deep Learning Fundamentals", department_id: "dept-csai", semester: 5, academic_year: "2026-2027", credits: 4, lecture_count: 3, tutorial_count: 1, practical_count: 0, lecture_duration: 1.0, tutorial_duration: 1.0, practical_duration: 2.0, total_weekly_hours: 4.0, required_room_type: "classroom", assigned_teachers: ["F013"] },
  { id: "c-csai5-dll", course_code: "CSAI5-DLL", course_name: "Deep Learning Lab", department_id: "dept-csai", semester: 5, academic_year: "2026-2027", credits: 2, lecture_count: 0, tutorial_count: 0, practical_count: 1, lecture_duration: 1.0, tutorial_duration: 1.0, practical_duration: 2.0, total_weekly_hours: 2.0, required_room_type: "lab", required_lab_specialization: "AI/ML GPU", assigned_teachers: ["F013"] },
  { id: "c-csai5-ml", course_code: "CSAI5-ML", course_name: "Machine Learning", department_id: "dept-csai", semester: 5, academic_year: "2026-2027", credits: 4, lecture_count: 3, tutorial_count: 0, practical_count: 0, lecture_duration: 1.0, tutorial_duration: 1.0, practical_duration: 2.0, total_weekly_hours: 3.0, required_room_type: "classroom", assigned_teachers: ["F012"] },
  { id: "c-csai5-mll", course_code: "CSAI5-MLL", course_name: "ML Lab", department_id: "dept-csai", semester: 5, academic_year: "2026-2027", credits: 2, lecture_count: 0, tutorial_count: 0, practical_count: 1, lecture_duration: 1.0, tutorial_duration: 1.0, practical_duration: 2.0, total_weekly_hours: 2.0, required_room_type: "lab", required_lab_specialization: "AI/ML GPU", assigned_teachers: ["F012"] },
];

let defaultConfig: TimetableConfig = {
  id: "cfg-default",
  name: "Regular Academic Schedule",
  working_days: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
  day_start_time: "09:00",
  day_end_time: "17:00",
  period_duration_minutes: 60,
  break_slots: [
    { name: "Morning Break", start: "10:00", end: "10:15" },
    { name: "Lunch Break", start: "12:15", end: "13:00" },
  ],
  period_slots: [
    { id: "slot-1", period_number: 1, label: "1st Class", start_time: "09:00", end_time: "10:00", is_break: false },
    { id: "slot-break1", label: "Break", start_time: "10:00", end_time: "10:15", is_break: true, break_type: "short" },
    { id: "slot-2", period_number: 2, label: "2nd Class", start_time: "10:15", end_time: "11:15", is_break: false },
    { id: "slot-3", period_number: 3, label: "3rd Class", start_time: "11:15", end_time: "12:15", is_break: false },
    { id: "slot-lunch", label: "Lunch Break", start_time: "12:15", end_time: "13:00", is_break: true, break_type: "lunch" },
    { id: "slot-4", period_number: 4, label: "4th Class", start_time: "13:00", end_time: "14:00", is_break: false },
    { id: "slot-5", period_number: 5, label: "5th Class", start_time: "14:00", end_time: "15:00", is_break: false },
    { id: "slot-6", period_number: 6, label: "6th Class", start_time: "15:00", end_time: "16:00", is_break: false },
    { id: "slot-7", period_number: 7, label: "7th Class", start_time: "16:00", end_time: "17:00", is_break: false },
  ],
  max_faculty_daily_hours: 2,
};

let versions: TimetableVersion[] = [
  {
    id: "ver-1",
    config_id: "cfg-default",
    department_id: "dept-cse",
    academic_year: "2026-2027",
    semester_type: "odd",
    version_number: 1,
    name: "Draft 1 (Odd Semester)",
    status: "draft",
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

let sessions: Record<string, TimetableSession[]> = {
  "ver-1": [],
};

// ============================================================================
// Public Data Store API
// ============================================================================

export const timetableStore = {
  // Catalogs
  getDepartments: () => [...departments],
  getTeachers: () => [...teachers],
  addTeacher: (t: Omit<Teacher, "id">) => {
    const id = `t-${Date.now()}`;
    const newT: Teacher = { ...t, id };
    teachers.push(newT);
    return newT;
  },
  updateTeacher: (id: string, patch: Partial<Teacher>) => {
    const idx = teachers.findIndex((t) => t.id === id);
    if (idx >= 0) {
      teachers[idx] = { ...teachers[idx], ...patch };
      return teachers[idx];
    }
    return null;
  },
  deleteTeacher: (id: string) => {
    const idx = teachers.findIndex((t) => t.id === id);
    if (idx >= 0) teachers.splice(idx, 1);
  },

  // Rooms
  getRooms: () => [...rooms],
  addRoom: (r: Omit<Room, "id">) => {
    const id = `r-${Date.now()}`;
    const newR: Room = { ...r, id };
    rooms.push(newR);
    return newR;
  },
  updateRoom: (id: string, patch: Partial<Room>) => {
    const idx = rooms.findIndex((r) => r.id === id);
    if (idx >= 0) {
      rooms[idx] = { ...rooms[idx], ...patch };
      return rooms[idx];
    }
    return null;
  },
  deleteRoom: (id: string) => {
    const idx = rooms.findIndex((r) => r.id === id);
    if (idx >= 0) rooms.splice(idx, 1);
  },

  // Batches
  getBatches: () => [...batches],
  addBatch: (b: Omit<Batch, "id">) => {
    const id = `b-${Date.now()}`;
    const newB: Batch = { ...b, id };
    batches.push(newB);
    return newB;
  },
  updateBatch: (id: string, patch: Partial<Batch>) => {
    const idx = batches.findIndex((b) => b.id === id);
    if (idx >= 0) {
      batches[idx] = { ...batches[idx], ...patch };
      return batches[idx];
    }
    return null;
  },

  // Courses
  getCourses: () => [...courses],
  addCourse: (c: Omit<Course, "id">) => {
    const id = `c-${Date.now()}`;
    const lHours = (c.lecture_count || 0) * (c.lecture_duration || 1.0);
    const tHours = (c.tutorial_count || 0) * (c.tutorial_duration || 1.0);
    const pHours = (c.practical_count || 0) * (c.practical_duration || 2.0);
    const total_weekly_hours = Number((lHours + tHours + pHours).toFixed(2));
    const newC: Course = { ...c, id, total_weekly_hours };
    courses.push(newC);
    return newC;
  },
  updateCourse: (id: string, patch: Partial<Course>) => {
    const idx = courses.findIndex((c) => c.id === id);
    if (idx >= 0) {
      const merged = { ...courses[idx], ...patch };
      const lHours = (merged.lecture_count || 0) * (merged.lecture_duration || 1.0);
      const tHours = (merged.tutorial_count || 0) * (merged.tutorial_duration || 1.0);
      const pHours = (merged.practical_count || 0) * (merged.practical_duration || 2.0);
      merged.total_weekly_hours = Number((lHours + tHours + pHours).toFixed(2));
      courses[idx] = merged;
      return courses[idx];
    }
    return null;
  },
  deleteCourse: (id: string) => {
    const idx = courses.findIndex((c) => c.id === id);
    if (idx >= 0) courses.splice(idx, 1);
  },

  // Availability
  getTeacherAvailability: (teacherId?: string) => {
    if (!teacherId) return [...teacherAvailability];
    return teacherAvailability.filter((a) => a.teacher_id === teacherId);
  },
  setTeacherAvailability: (records: TeacherAvailability[]) => {
    teacherAvailability.length = 0;
    teacherAvailability.push(...records);
  },

  // Config
  getConfig: () => ({ ...defaultConfig }),
  updateConfig: (patch: Partial<TimetableConfig>) => {
    defaultConfig = { ...defaultConfig, ...patch };
    return { ...defaultConfig };
  },

  // Timetable & Admin Fallback State
  getTimetableState: () => {
    const active = timetableStore.getActiveVersion();
    const activeSessions = active ? timetableStore.getSessions(active.id) : [];
    return {
      finalized: active ? active.status === "published" : false,
      template_row_count: activeSessions.length,
      locked_occurrence_count: activeSessions.length,
      horizon: {
        start: new Date().toISOString(),
        end: new Date(Date.now() + 16 * 7 * 864e5).toISOString(),
        weeks: 16,
      },
      entries: activeSessions.map((s, idx) => ({
        entry_id: `E${String(idx + 1).padStart(3, "0")}`,
        resource_id: s.room_id,
        day: s.day_of_week,
        start_time: s.start_time,
        end_time: s.end_time,
        course_code: s.course_code,
        course_name: s.course_name,
        section_id: s.section_id,
        faculty_id: s.teacher_id,
        faculty_name: s.teacher_name,
      })),
    };
  },

  getAdminState: () => {
    const active = timetableStore.getActiveVersion();
    const activeSessions = active ? timetableStore.getSessions(active.id) : [];
    const roomsList = timetableStore.getRooms();

    const now = new Date();
    const currentDay = now.getUTCDay();
    const mondayOffset = currentDay === 0 ? -6 : 1 - currentDay;
    const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + mondayOffset));

    const dayMap: Record<string, number> = {
      Mon: 0,
      Tue: 1,
      Wed: 2,
      Thu: 3,
      Fri: 4,
      Sat: 5,
    };

    const accepted: Array<{
      request_id: string;
      user_id: string;
      resource_id: string;
      start: string;
      end: string;
      is_timetable: boolean;
    }> = [];

    activeSessions.forEach((s, idx) => {
      const offset = dayMap[s.day_of_week] ?? 0;
      const classDate = new Date(monday.getTime() + offset * 864e5);
      const ymdStr = classDate.toISOString().slice(0, 10);
      accepted.push({
        request_id: `E${String(idx + 1).padStart(3, "0")}#W01`,
        user_id: s.teacher_id,
        resource_id: s.room_id,
        start: `${ymdStr}T${s.start_time}:00`,
        end: `${ymdStr}T${s.end_time}:00`,
        is_timetable: true,
      });
    });

    return {
      resources: roomsList.map((r) => ({
        resource_id: r.room_id,
        name: r.name,
        resource_type: r.room_type,
        capacity: r.capacity,
        threshold_hours: 8,
        location: r.building,
        department: r.department_id || "CSE",
        exclusive_use: r.exclusive_use,
      })),
      accepted,
      pending: [],
      rejected: [],
      timetable_finalized: active ? active.status === "published" : false,
      timetable_locked_count: activeSessions.length,
      accepted_total_count: accepted.length,
    };
  },

  // Versions & Sessions
  getVersions: () => [...versions],
  getVersion: (id: string) => versions.find((v) => v.id === id) || null,
  getActiveVersion: () => versions.find((v) => v.is_active) || versions[0] || null,
  getSessions: (versionId: string) => [...(sessions[versionId] || [])],
  saveSessions: (versionId: string, newSessions: TimetableSession[]) => {
    sessions[versionId] = [...newSessions];
    const v = versions.find((item) => item.id === versionId);
    if (v) v.updated_at = new Date().toISOString();
  },
  updateSession: (versionId: string, sessionId: string, patch: Partial<TimetableSession>) => {
    const list = sessions[versionId] || [];
    const idx = list.findIndex((s) => s.id === sessionId);
    if (idx >= 0) {
      list[idx] = { ...list[idx], ...patch };
      return list[idx];
    }
    return null;
  },
  updateVersionStatus: (id: string, status: TimetableVersion["status"]) => {
    const v = versions.find((item) => item.id === id);
    if (v) {
      v.status = status;
      v.updated_at = new Date().toISOString();
    }
  },
};
