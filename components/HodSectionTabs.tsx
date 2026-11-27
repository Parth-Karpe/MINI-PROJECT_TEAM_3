"use client";
import Link from "next/link";
import { hodPageLabel, hodSectionOf, type HodPage } from "@/lib/dashboardPages";

/** Tabs for the pages inside one HOD sidebar section (Scheduling, Resources, Reports & stats). */
export function HodSectionTabs({ page }: { page: HodPage }) {
  const section = hodSectionOf(page);
  if (!section || section.pages.length < 2) return null;
  return <nav className="hod-tabs" aria-label={`${section.label} pages`}>
    {section.pages.map(p => <Link key={p} href={`/dashboards/hod/${p}`} className={p === page ? "on" : undefined}
      aria-current={p === page ? "page" : undefined}>{hodPageLabel(p)}</Link>)}
  </nav>;
}
