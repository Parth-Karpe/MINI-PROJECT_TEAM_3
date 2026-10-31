"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarDays,
  LayoutDashboard,
  Server,
  CalendarCheck,
  Clock,
  BookmarkCheck,
  ShieldAlert,
  Sparkles,
} from "lucide-react";

const NAV_ITEMS = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/timetable/maker", label: "Timetable Studio", icon: CalendarDays, highlight: true },
  { href: "/resources", label: "Resources", icon: Server },
  { href: "/timetable", label: "Default Timetable", icon: CalendarCheck },
  { href: "/schedule", label: "Schedule Gantt", icon: Clock },
  { href: "/bookings", label: "Bookings & Queue", icon: BookmarkCheck },
  { href: "/admin", label: "Admin Overrides", icon: ShieldAlert },
];

export function Nav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col justify-between border-r border-[#26324A] bg-[#121B2E] p-4 text-sm select-none">
      <div>
        {/* Brand Header */}
        <div className="flex items-center gap-3 px-2 py-3 mb-6">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-tr from-[#0891B2] via-[#4FD1C5] to-[#34C77B] flex items-center justify-center shadow-lg shadow-teal-500/20">
            <Sparkles className="w-5 h-5 text-[#06231F]" />
          </div>
          <div>
            <h1 className="font-bold text-base tracking-tight text-white leading-none">
              Smart Campus
            </h1>
            <span className="text-[11px] font-medium text-teal-400 tracking-wide uppercase mt-1 block">
              Resource Optimizer
            </span>
          </div>
        </div>

        {/* Navigation Section */}
        <div className="space-y-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg font-medium text-xs transition-all duration-150 ${
                  isActive
                    ? "bg-teal-500/15 text-teal-300 border border-teal-500/30 shadow-sm shadow-teal-500/20"
                    : "text-slate-400 hover:text-slate-200 hover:bg-[#17233A]"
                } ${item.highlight && !isActive ? "text-teal-400/90" : ""}`}
              >
                <Icon className={`w-4 h-4 ${isActive ? "text-teal-300" : "text-slate-400"}`} />
                <span>{item.label}</span>
                {item.highlight && !isActive && (
                  <span className="ml-auto text-[9px] bg-teal-500/20 text-teal-300 px-1.5 py-0.5 rounded font-semibold uppercase">
                    New
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      </div>

      {/* User / Department Footer */}
      <div className="nav-footer pt-4 border-t border-[#26324A] mt-auto">
        <div className="flex items-center gap-3 px-2 py-1.5 rounded-lg bg-[#17233A]/60 border border-[#26324A]/70">
          <div className="w-8 h-8 rounded-full bg-slate-700/60 border border-slate-600 flex items-center justify-center text-xs font-semibold text-slate-300">
            DR
          </div>
          <div className="overflow-hidden">
            <span className="block text-xs font-semibold text-slate-200 truncate">
              Dr. Ananya Rao
            </span>
            <span className="block text-[10px] text-teal-400 font-medium">
              HOD · Computer Science
            </span>
          </div>
        </div>
      </div>
    </nav>
  );
}
