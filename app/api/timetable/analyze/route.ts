import { NextResponse } from "next/server";
import { analyzeTimetable } from "@/lib/engine";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { csv_text?: string };
  const res = await analyzeTimetable(body.csv_text ?? "");
  return NextResponse.json(res.data, { status: res.status });
}
