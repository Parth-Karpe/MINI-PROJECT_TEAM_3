import { NextResponse } from "next/server";
import { resetEngine } from "@/lib/engine";

export async function POST() {
  const res = await resetEngine();
  return NextResponse.json(res.data, { status: res.status });
}
