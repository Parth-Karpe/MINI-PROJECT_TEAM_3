import { NextResponse } from "next/server";
import { getEngineHealth } from "@/lib/engine";

export async function GET() {
  const { status, data } = await getEngineHealth();
  return NextResponse.json(data, { status });
}
