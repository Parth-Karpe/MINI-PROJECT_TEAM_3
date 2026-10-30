import { NextRequest, NextResponse } from "next/server";
import { getStudentDashboard } from "@/lib/engine";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ user_id: string }> }) {
  const { user_id } = await params;
  const dashboard = await getStudentDashboard(user_id);
  return NextResponse.json(dashboard.data, { status: dashboard.status });
}
