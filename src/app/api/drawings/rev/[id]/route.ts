import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current";
import { jsonFor } from "@/lib/api";
import { DRAWING_VIEW_ROLES, revisionView } from "@/lib/drawings/server";
import { hasAnyRole } from "@/lib/roles";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (!hasAnyRole(user.roles, DRAWING_VIEW_ROLES)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const v = await revisionView(user, (await ctx.params).id);
  if (!v) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (v === "forbidden") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  return jsonFor(user, v);
}
