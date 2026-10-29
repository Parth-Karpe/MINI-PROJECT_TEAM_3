import { NextRequest, NextResponse } from "next/server";
import { submitRequest } from "@/lib/engine";

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const idempotencyKey = req.headers.get("idempotency-key") ?? undefined;
  const res = await submitRequest(body, idempotencyKey);
  return NextResponse.json(res.data, { status: res.status });
}
