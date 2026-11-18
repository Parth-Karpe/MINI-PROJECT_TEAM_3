import type { Role } from "./publishedTimetable";

export type DashboardSection = "timetable" | "availability" | "faculty-requests" | "inbox" | "review" | "reports" | "announcements" | "overrides";

export const dashboardPages: Record<Role, readonly { id: DashboardSection; label: string }[]> = {
  student: [
    { id: "timetable", label: "My timetable" },
    { id: "availability", label: "Find free resources" },
    { id: "inbox", label: "My requests & updates" },
  ],
  faculty: [
    { id: "timetable", label: "My timetable" },
    { id: "availability", label: "Find free resources" },
    { id: "faculty-requests", label: "Faculty requests" },
    { id: "inbox", label: "Requests & messages" },
  ],
  hod: [
    { id: "timetable", label: "Department timetable" },
    { id: "availability", label: "Find free resources" },
    { id: "inbox", label: "Approvals & waiting queue" },
    { id: "review", label: "Timetable review" },
    { id: "announcements", label: "Announcements" },
    { id: "overrides", label: "Schedule overrides" },
    { id: "reports", label: "Reports & decision history" },
  ],
  admin: [],
};
