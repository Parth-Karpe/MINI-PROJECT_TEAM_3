import { NextRequest, NextResponse } from "next/server";
import { getResourceStatus } from "@/lib/engine";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ resource_id: string }> }
) {
  const { resource_id } = await params;
  const { searchParams } = new URL(_req.url);
  const status = await getResourceStatus(
    resource_id,
    searchParams.get("start") ?? "",
    searchParams.get("end") ?? ""
  );
  return NextResponse.json(status.data, { status: status.status });
}
