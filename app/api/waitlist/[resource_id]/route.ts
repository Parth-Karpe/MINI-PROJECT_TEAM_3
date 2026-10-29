import { NextRequest, NextResponse } from "next/server";
import { waitlistPosition } from "@/lib/engine";
export async function GET(req: NextRequest, { params }: { params: Promise<{ resource_id: string }> }) {
  const { resource_id } = await params;
  const { searchParams } = new URL(req.url);
  const position = await waitlistPosition(
    resource_id,
    searchParams.get("request_id") ?? "",
    searchParams.get("start") ?? "",
    searchParams.get("end") ?? ""
  );
  return NextResponse.json(position.data, { status: position.status });
}
