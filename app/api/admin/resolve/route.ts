import { NextRequest, NextResponse } from "next/server";
import { resolveDue } from "@/lib/engine";

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { now?: string | null };
  const res = await resolveDue(body.now ?? undefined);
  return NextResponse.json(res.data, { status: res.status });
}
