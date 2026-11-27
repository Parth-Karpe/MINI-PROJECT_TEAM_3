"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import type { Identity } from "@/lib/localAuth";
import { DashboardClock, useDashboardClock } from "./DashboardClock";
import { CalendarDays, ClipboardList, DoorOpen, Inbox, LayoutDashboard, Search, Upload, type LucideIcon } from "lucide-react";
import { dashboardPages, hodSections, type DashboardSection } from "@/lib/dashboardPages";

/** Small icons that make the sidebar quicker to scan. */
const ICONS: Record<string, LucideIcon> = {
  overview: LayoutDashboard, scheduling: CalendarDays, resources: DoorOpen,
  timetable: CalendarDays, availability: Search, "faculty-requests": ClipboardList, inbox: Inbox, imports: Upload,
};
const withIcon = (key: string, label: string) => { const I = ICONS[key]; return <>{I && <I size={16} strokeWidth={2} aria-hidden="true" />}<span>{label}</span></>; };

type NavLink = { href: string; label: string; icon: string };

export function Nav() {
  const path = usePathname();
  const [user, setUser] = useState<Identity | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/session", { signal: controller.signal })
      .then(response => response.json())
      .then(data => setUser(data.user ?? null))
      .catch(() => { if (!controller.signal.aborted) setUser(null); });
    return () => controller.abort();
  }, [path]);

  const showClock = !!user && user.role !== "admin" && path.startsWith("/dashboards/");
  const clock = useDashboardClock(showClock);

  if (path === "/login") return null;

  const base = user ? "/dashboards/" + user.role : "";
  const pageLabel = (id: DashboardSection) => user ? dashboardPages[user.role].find(page => page.id === id)?.label ?? id : id;
  const linkTo = (target: "overview" | "stats" | DashboardSection, label?: string): NavLink => ({
    href: target === "overview" ? base : base + "/" + target, icon: target,
    label: label ?? (target === "overview" ? "Overview" : target === "stats" ? "Department stats" : pageLabel(target)),
  });
  const renderLink = (link: NavLink) => <Link key={link.href} href={link.href} className={path === link.href ? "on" : undefined}
    aria-current={path === link.href ? "page" : undefined}>{withIcon(link.icon, link.label)}</Link>;

  let links: React.ReactNode = null;
  if (user?.role === "hod") {
    // Three sections; a section is selected while any of its pages is open.
    links = hodSections.map(section => {
      const href = section.pages.length ? `${base}/${section.id}` : base;
      // A section stays selected on its combined page and on any of its older single-page routes;
      // Overview also stays selected on the full department stats page it links to.
      const on = section.pages.length ? path === href || section.pages.some(p => path === `${base}/${p}`) : path === base || path === `${base}/stats`;
      return <Link key={section.id} href={href} className={on ? "on" : undefined} aria-current={on ? "page" : undefined}>{withIcon(section.id, section.label)}</Link>;
    });
  } else if (user) {
    links = <>
      {[linkTo("overview"), ...dashboardPages[user.role].map(page => linkTo(page.id, page.label))].map(renderLink)}
      {user.role === "admin" && <Link href={base + "#imports"}>{withIcon("imports", "CSV imports")}</Link>}
    </>;
  }

  return <nav className="dashboard-nav" aria-label="Main navigation">
    <div className="dashboard-nav-brand"><h2>Smart Campus</h2><p>CSE (AI)</p></div>
    {user ? <>
      <p className="dashboard-nav-account">{user.name}<small>{user.id} · {user.role.toUpperCase()}</small></p>
      <div className="dashboard-nav-links">{links}</div>
      <div className="dashboard-nav-footer">
        {showClock && <DashboardClock {...clock} />}
        <button type="button" className="dashboard-nav-signout" onClick={async () => {
          await fetch("/api/session", { method: "DELETE" });
          window.location.assign("/login");
        }}>Sign out</button>
      </div>
    </> : <Link href="/login">Sign in</Link>}
  </nav>;
}
