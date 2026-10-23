import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// For uptime checks (no login, no data): app is up and the database answers.
export async function GET() {
  try {
    await db.$queryRawUnsafe("SELECT 1");
    return NextResponse.json({ ok: true, time: new Date().toISOString() });
  } catch {
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}
