import { NextResponse } from "next/server";
import { finalizeTimetable } from "@/lib/engine";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    csv_text?: string;
    actor_id?: string;
    actor_role?: string;
    week_start?: string;
    weeks?: number;
    replace?: boolean;
    now?: string;
  };
  const res = await finalizeTimetable({
    csv_text: body.csv_text ?? "",
    actor_id: body.actor_id ?? "",
    actor_role: body.actor_role ?? "hod",
    week_start: body.week_start ?? "",
    weeks: body.weeks,
    replace: body.replace,
    now: body.now,
  });
  return NextResponse.json(res.data, { status: res.status });
}
