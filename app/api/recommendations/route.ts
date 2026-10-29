import { NextRequest, NextResponse } from "next/server";
import { getRecommendations } from "@/lib/engine";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const recommendations = await getRecommendations({
    resource_type: searchParams.get("resource_type") ?? "",
    duration_hours: Number(searchParams.get("duration_hours") ?? 1),
    min_capacity: Number(searchParams.get("min_capacity") ?? 1),
    user_id: searchParams.get("user_id") ?? "",
    priority: Number(searchParams.get("priority") ?? 1),
    horizon_start: searchParams.get("horizon_start") ?? "",
    horizon_end: searchParams.get("horizon_end") ?? "",
    top_n: searchParams.get("top_n") ? Number(searchParams.get("top_n")) : undefined,
  });
  return NextResponse.json(recommendations.data, { status: recommendations.status });
}
