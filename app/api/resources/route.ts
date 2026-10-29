import { NextResponse } from "next/server";
import { getEngineResources, registerResources } from "@/lib/engine";
import type { ResourceRegistration } from "@/lib/types";

export async function GET() {
  const res = await getEngineResources();
  return NextResponse.json(res.data, { status: res.status });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => (null))) as unknown;
  const resources = Array.isArray(body)
    ? (body as ResourceRegistration[])
    : ((body as { resources?: ResourceRegistration[] } | null)?.resources ?? []);
  const res = await registerResources(resources);
  return NextResponse.json(res.data, { status: res.status });
}
