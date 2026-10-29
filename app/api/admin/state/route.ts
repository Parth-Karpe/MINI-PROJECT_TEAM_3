import { NextRequest, NextResponse } from "next/server";
import { forwardToEngine } from "@/lib/backend";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const qs = searchParams.toString();
  const endpoint = `/admin/state${qs ? `?${qs}` : ""}`;
  const { status, data } = await forwardToEngine(endpoint);
  return NextResponse.json(data, { status });
}
