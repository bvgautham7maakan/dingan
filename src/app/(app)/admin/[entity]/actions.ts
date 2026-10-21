"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireRole } from "@/lib/auth/current";
import { ENTITIES } from "@/lib/admin/master";
import { audit } from "@/lib/audit";

export async function saveMaster(form: FormData) {
  const me = await requireRole(["ADMIN"]);
  const entity = z.string().parse(form.get("_entity"));
  const cfg = ENTITIES[entity];
  if (!cfg) throw new Error("unknown entity");
  const id = (form.get("_id") as string) || null;
  let result;
  try {
    result = await cfg.save(id, form);
  } catch (e) {
    const msg =
      e instanceof z.ZodError
        ? e.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")
        : (e as { code?: string }).code === "P2002"
          ? "That code/name already exists."
          : "Could not save.";
    redirect(`/admin/${entity}?${id ? `edit=${id}&` : ""}error=${encodeURIComponent(msg)}`);
  }
  await audit({
    actorId: me.id,
    action: id ? "EDIT" : "CREATE",
    entityType: entity,
    entityId: result.id,
    before: result.before,
    after: result.after,
  });
  redirect(`/admin/${entity}?saved=1`);
}
