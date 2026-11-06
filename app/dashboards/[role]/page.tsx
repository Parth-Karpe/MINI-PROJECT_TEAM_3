import { notFound } from "next/navigation";
import { RoleDashboard } from "@/components/RoleDashboard";
import { DEMO_USERS, type Role } from "@/lib/publishedTimetable";
export default async function DashboardPage({ params }: { params: Promise<{ role: string }> }) {
  const { role } = await params;
  if (!Object.hasOwn(DEMO_USERS, role)) notFound();
  return <RoleDashboard role={role as Role} />;
}
