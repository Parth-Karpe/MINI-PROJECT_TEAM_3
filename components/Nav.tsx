"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/", label: "Overview" },
  { href: "/resources", label: "Resources" },
  { href: "/timetable", label: "Timetable" },
  { href: "/schedule", label: "Schedule" },
  { href: "/bookings", label: "Bookings" },
  { href: "/admin", label: "Admin" },
];

export function Nav() {
  const pathname = usePathname();
  const active =
    pathname === "/" ? "/" : pathname.replace(/\/[^/]*$/, "") || "/";

  return (
    <nav>
      <h1>Smart Campus</h1>
      <small>Resource Engine</small>
      {NAV_ITEMS.map((item) => {
        const isActive =
          item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        return (
          <Link key={item.href} href={item.href} className={isActive ? "on" : undefined}>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
