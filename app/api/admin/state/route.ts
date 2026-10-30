import { NextRequest, NextResponse } from "next/server";
import { getAdminState } from "@/lib/engine";
import type { AdminStateQuery } from "@/lib/engine";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const state = await getAdminState({
    window_start: searchParams.get("window_start") ?? undefined,
    window_end: searchParams.get("window_end") ?? undefined,
    now: searchParams.get("now") ?? undefined,
  });
  return NextResponse.json(state.data, { status: state.status });
}
