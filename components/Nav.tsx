"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { DEMO_USERS, type Role } from "@/lib/publishedTimetable";
export function Nav() {
  const pathname = usePathname();
  const roles: Role[] = ["hod", "faculty", "student", "admin"];
  const selected = pathname.split("/")[2] as Role;
  const admin = !pathname.startsWith("/dashboards/") || selected === "admin";
  return <nav><div><h2 style={{color:"#4fd1c5",marginBottom:0}}>Smart Campus</h2><p style={{fontSize:12,color:"#7c8aa8",marginTop:4}}>CSE (AI) · Semester V</p><p style={{fontSize:11,color:"#7c8aa8",marginTop:30}}>DEMO DASHBOARDS</p>{roles.map(role => <Link key={role} href={`/dashboards/${role}`} style={selected===role?{background:"#183737",color:"#6ee7d7"}:{}}><span>{role.toUpperCase()}<small style={{display:"block",fontSize:11,color:"#94a3b8"}}>{DEMO_USERS[role].name}</small></span></Link>)}{admin && <><p style={{fontSize:11,color:"#7c8aa8",marginTop:24}}>ADMIN TOOLS</p>{[["/resources","Resources"],["/timetable","Legacy timetable"],["/timetable/maker","Timetable Studio"],["/schedule","Schedule"],["/bookings","Bookings & queues"],["/admin","Overrides & audit"]].map(([href,label]) => <Link key={href} href={href}>{label}</Link>)}</>}</div><p style={{fontSize:11,color:"#7c8aa8",marginTop:"auto",paddingTop:24}}>Local demo role switcher<br/>No production sign-in configured</p></nav>;
}
