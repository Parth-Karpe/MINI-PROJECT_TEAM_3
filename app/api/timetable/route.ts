import { NextResponse } from "next/server";
import { getTimetable, submitTimetable } from "@/lib/engine";
import type { TimetableEntryRegistration } from "@/lib/types";

export async function GET() {
  const res = await getTimetable();
  return NextResponse.json(res.data, { status: res.status });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => (null))) as unknown;
  const entries = Array.isArray(body)
    ? (body as TimetableEntryRegistration[])
    : ((body as { entries?: TimetableEntryRegistration[] } | null)?.entries ?? []);
  const now = new URL(req.url).searchParams.get("now") ?? undefined;
  const res = await submitTimetable(entries, now ?? undefined);
  return NextResponse.json(res.data, { status: res.status });
}
