import { NextRequest, NextResponse } from "next/server";
import { getFacultyDashboard } from "@/lib/engine";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ user_id: string }> }) {
  const { user_id } = await params;
  const dashboard = await getFacultyDashboard(user_id);
  return NextResponse.json(dashboard.data, { status: dashboard.status });
}
