import { NextRequest, NextResponse } from "next/server";
import { getAudit } from "@/lib/engine";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const audit = await getAudit({
    resource_id: searchParams.get("resource_id") ?? undefined,
    request_id: searchParams.get("request_id") ?? undefined,
    user_id: searchParams.get("user_id") ?? undefined,
  });
  return NextResponse.json(audit.data, { status: audit.status });
}
