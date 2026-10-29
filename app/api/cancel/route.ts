import { NextRequest, NextResponse } from "next/server";
import { cancelBooking } from "@/lib/engine";

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { request_id?: string; now?: string | null };
  const res = await cancelBooking(String(body.request_id ?? ""), body.now ?? undefined);
  return NextResponse.json(res.data, { status: res.status });
}
