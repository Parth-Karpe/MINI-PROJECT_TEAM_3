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
 * HOD sidebar: four sections. Every existing HOD page stays reachable as a tab inside its section;
 * the first page listed is where the sidebar link lands. "stats" is the department stats page.
 */
export type HodPage = DashboardSection | "stats";
export const hodSections: readonly { id: string; label: string; pages: readonly HodPage[] }[] = [
  { id: "overview", label: "Overview", pages: [] },
  { id: "scheduling", label: "Scheduling", pages: ["review", "inbox", "timetable", "announcements"] },
  { id: "resources", label: "Resources", pages: ["availability", "overrides"] },
  { id: "reports", label: "Reports & stats", pages: ["reports", "stats"] },
];
export const hodPageLabel = (page: HodPage) => page === "stats" ? "Department stats" : dashboardPages.hod.find(p => p.id === page)?.label ?? page;
export const hodSectionOf = (page: HodPage) => hodSections.find(s => s.pages.includes(page));
