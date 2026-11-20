import { notFound } from "next/navigation";
import { RoleDashboard } from "@/components/RoleDashboard";
import { dashboardPages } from "@/lib/dashboardPages";
import type { Role } from "@/lib/publishedTimetable";

export default async function DashboardSectionPage({ params }: {
  params: Promise<{ role: string; section: string }>;
}) {
  const { role, section } = await params;
  if (!Object.hasOwn(dashboardPages, role)) notFound();
  const page = dashboardPages[role as Role].find(entry => entry.id === section);
  if (!page) notFound();
  return <RoleDashboard role={role as Role} section={page.id} title={page.label} />;
}
