import { NextResponse } from "next/server";
import { importReference } from "@/lib/engine";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    sections_csv?: string | null;
    faculty_csv?: string | null;
    courses_csv?: string | null;
  };
  const res = await importReference({
    sections_csv: body.sections_csv ?? null,
    faculty_csv: body.faculty_csv ?? null,
    courses_csv: body.courses_csv ?? null,
  });
  return NextResponse.json(res.data, { status: res.status });
}
