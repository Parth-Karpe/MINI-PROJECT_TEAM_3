"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import type { Identity } from "@/lib/localAuth";
import { DashboardClock, useDashboardClock } from "./DashboardClock";
import { dashboardPages } from "@/lib/dashboardPages";

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
  const links = user ? [
    { href: base, label: "Overview" },
    ...dashboardPages[user.role].map(page => ({ href: base + "/" + page.id, label: page.label })),
  ] : [];
  return <nav className="dashboard-nav" aria-label="Main navigation">
    <div className="dashboard-nav-brand"><h2>Smart Campus</h2><p>CSE (AI)</p></div>
    {user ? <>
      <p className="dashboard-nav-account">{user.name}<small>{user.id} · {user.role.toUpperCase()}</small></p>
      <div className="dashboard-nav-links">{links.map(link =>
        <Link key={link.href} href={link.href} className={path === link.href ? "on" : undefined}
          aria-current={path === link.href ? "page" : undefined}>{link.label}</Link>
      )}{user.role === "admin" && <Link href={base + "#imports"}>CSV imports</Link>}</div>
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
