import { NextRequest, NextResponse } from "next/server";
import { getAvailability } from "@/lib/engine";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const availability = await getAvailability({
    start: searchParams.get("start") ?? "",
    end: searchParams.get("end") ?? "",
    min_capacity: searchParams.get("min_capacity") ? Number(searchParams.get("min_capacity")) : undefined,
    resource_type: searchParams.get("resource_type") ?? undefined,
    near_location: searchParams.get("near_location") ?? undefined,
  });
  return NextResponse.json(availability.data, { status: availability.status });
}
