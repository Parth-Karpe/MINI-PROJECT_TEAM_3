import { NextRequest, NextResponse } from "next/server";
import { getHodDashboard } from "@/lib/engine";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ department: string }> }) {
  const { department } = await params;
  const windowStart = _req.nextUrl.searchParams.get("window_start") ?? "";
  const windowEnd = _req.nextUrl.searchParams.get("window_end") ?? "";
  const dashboard = await getHodDashboard(department, windowStart, windowEnd);
  return NextResponse.json(dashboard.data, { status: dashboard.status });
}
