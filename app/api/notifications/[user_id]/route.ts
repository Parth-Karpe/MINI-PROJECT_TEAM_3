import { NextRequest, NextResponse } from "next/server";
import { getNotifications } from "@/lib/engine";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ user_id: string }> }) {
  const { user_id } = await params;
  const notifications = await getNotifications(user_id);
  return NextResponse.json(notifications.data, { status: notifications.status });
}
