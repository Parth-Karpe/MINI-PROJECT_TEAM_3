import { notFound } from "next/navigation";
import { DeptStats } from "@/components/stats/DeptStats";

type Props = { params: Promise<{ role: string }> };

// Only the HOD gets this page. Everyone else sees the standard not-found screen.
export async function generateMetadata({ params }: Props) {
  const { role } = await params;
  return role === "hod" ? { title: "Department stats · Smart Campus" } : {};
}

export default async function StatsPage({ params }: Props) {
  const { role } = await params;
  if (role !== "hod") notFound();
  return <DeptStats />;
}
