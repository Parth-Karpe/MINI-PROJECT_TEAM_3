import { NextRequest, NextResponse } from "next/server";
import { getReport } from "@/lib/engine";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const report = await getReport({
    window_start: searchParams.get("window_start") ?? "",
    window_end: searchParams.get("window_end") ?? "",
  });
  return NextResponse.json(report.data, { status: report.status });
}
