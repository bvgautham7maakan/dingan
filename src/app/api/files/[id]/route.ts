import { readFile } from "fs/promises";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { absolutePath } from "@/lib/files";
import { hasAnyRole } from "@/lib/roles";
import { fcOnly } from "@/lib/drawings/server";

// Any signed-in user may open photos/voice notes, except drivers who see only their own uploads.
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const { id } = await ctx.params;
  const f = await db.fileObject.findUnique({ where: { id } });
  if (!f) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const driverOnly = user.roles.length === 1 && hasAnyRole(user.roles, ["DRIVER"]);
  if (driverOnly && f.uploadedById !== user.id) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  // site roles may open a drawing PDF only if that revision is released for construction
  if (f.kind === "PDF" && fcOnly(user)) {
    const released = await db.drawingRevision.findFirst({ where: { fileId: f.id, forConstruction: true } });
    if (!released) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const buf = await readFile(absolutePath(f.path));
  return new Response(new Uint8Array(buf), {
    headers: {
      "content-type": f.mime,
      "content-length": String(buf.length),
      "cache-control": "private, max-age=86400",
      "x-content-type-options": "nosniff",
      "content-disposition": "inline",
    },
  });
}
