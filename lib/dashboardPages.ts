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

/**
 * HOD sidebar: three sections. Scheduling and Resources each open one combined page
 * (/dashboards/hod/scheduling, /dashboards/hod/resources) that shows all of their pages together. The full department stats page ("stats")
 * is not in the sidebar: its essentials are on Overview, which links to it for the full detail.
 */
export type HodPage = DashboardSection | "stats";
export const hodSections: readonly { id: string; label: string; pages: readonly HodPage[] }[] = [
  { id: "overview", label: "Overview", pages: [] },
  { id: "scheduling", label: "Scheduling", pages: ["review", "inbox", "timetable", "announcements", "reports"] },
  { id: "resources", label: "Resources", pages: ["availability", "overrides"] },
];
export const hodPageLabel = (page: HodPage) => page === "stats" ? "Department stats" : dashboardPages.hod.find(p => p.id === page)?.label ?? page;
export const hodSectionOf = (page: HodPage) => hodSections.find(s => s.pages.includes(page));
