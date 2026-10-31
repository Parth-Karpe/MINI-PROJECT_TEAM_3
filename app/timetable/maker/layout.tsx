"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarDays,
  BookOpen,
  Users,
  Building2,
  Layers,
  Settings2,
} from "lucide-react";

const SUB_NAV = [
  { href: "/timetable/maker", label: "Studio Canvas", icon: CalendarDays },
  { href: "/timetable/maker/courses", label: "Courses & L-T-P", icon: BookOpen },
  { href: "/timetable/maker/teachers", label: "Faculty & Availability", icon: Users },
  { href: "/timetable/maker/rooms", label: "Rooms & Labs", icon: Building2 },
  { href: "/timetable/maker/batches", label: "Batches & Groups", icon: Layers },
  { href: "/timetable/maker/config", label: "Operational Rules", icon: Settings2 },
];

export default function TimetableMakerLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div>
      {/* Sub-navigation Header */}
      <div className="flex items-center gap-1.5 p-1.5 bg-[#121B2E] border border-[#26324A] rounded-xl mb-6 overflow-x-auto shadow-sm">
        {SUB_NAV.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-all duration-150 ${
                isActive
                  ? "bg-gradient-to-r from-teal-500/20 to-teal-500/10 text-teal-300 border border-teal-500/30 shadow-sm"
                  : "text-slate-400 hover:text-slate-200 hover:bg-[#17233A]"
              }`}
            >
              <Icon className={`w-3.5 h-3.5 ${isActive ? "text-teal-300" : "text-slate-400"}`} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>

      {children}
    </div>
  );
}
