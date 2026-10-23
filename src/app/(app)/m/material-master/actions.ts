"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth/current";
import { audit } from "@/lib/audit";
import { BOQ_EDIT_ROLES, MASTER_EDIT_ROLES } from "@/lib/materials/server";
import { importBoq } from "@/lib/materials/boq";

const MS_STATUS = ["DRAFT", "UNDER_REVIEW", "APPROVED", "APPROVED_WITH_COMMENTS", "REJECTED", "CLOSED"] as const;
const DISC = ["ELE", "PLB", "HVAC", "FLS", "GEN"] as const;
const opt = (v: FormDataEntryValue | null) => (v == null || String(v).trim() === "" ? undefined : String(v).trim());

export async function setMsStatus(form: FormData) {
  const me = await requireRole(MASTER_EDIT_ROLES);
  const id = z.string().parse(form.get("id"));
  const status = z.enum(MS_STATUS).parse(form.get("status"));
  const before = await db.materialSubmittal.findUniqueOrThrow({ where: { id } });
  await db.materialSubmittal.update({ where: { id }, data: { status } });
  await audit({ actorId: me.id, action: "EDIT", entityType: "MaterialSubmittal", entityId: id, before: { status: before.status }, after: { status } });
  redirect(`/m/material-master?project=${form.get("project") ?? ""}&saved=1#ms-${id}`);
}

export async function addSubmittal(form: FormData) {
  const me = await requireRole(MASTER_EDIT_ROLES);
  const d = z
    .object({
      projectId: z.string().optional(), material: z.string().min(1).max(200), discipline: z.enum(DISC), brand: z.string().min(1).max(100),
      msNo: z.string().max(40).optional(), revision: z.string().max(10).optional(), status: z.enum(MS_STATUS), spec: z.string().max(300).optional(),
    })
    .parse({
      projectId: opt(form.get("projectId")), material: opt(form.get("material")), discipline: form.get("discipline"), brand: opt(form.get("brand")),
      msNo: opt(form.get("msNo")), revision: opt(form.get("revision")), status: form.get("status"), spec: opt(form.get("spec")),
    });
  const name = d.material.toUpperCase().replace(/\s+/g, " ");
  const mat = await db.material.upsert({ where: { name_discipline: { name, discipline: d.discipline } }, update: {}, create: { name, discipline: d.discipline, keySpec: d.spec } });
  const row = await db.materialSubmittal.create({
    data: { materialId: mat.id, projectId: d.projectId ?? null, brand: d.brand, msNo: d.msNo, revision: d.revision, status: d.status, spec: d.spec },
  });
  await audit({ actorId: me.id, action: "CREATE", entityType: "MaterialSubmittal", entityId: row.id, after: d });
  redirect(`/m/material-master?project=${d.projectId ?? ""}&saved=1`);
}

export async function saveBoqLine(form: FormData) {
  const me = await requireRole(BOQ_EDIT_ROLES);
  const d = z
    .object({ projectId: z.string().min(1), materialId: z.string().min(1), qty: z.coerce.number().min(0), unit: z.string().max(20).optional(), rate: z.coerce.number().min(0).optional() })
    .parse({ projectId: form.get("projectId"), materialId: form.get("materialId"), qty: form.get("qty"), unit: opt(form.get("unit")), rate: opt(form.get("rate")) });
  const data = { qty: d.qty, unit: d.unit ?? null, ...(d.rate != null ? { rateFils: Math.round(d.rate * 100) } : {}) };
  const row = await db.boqLine.upsert({
    where: { projectId_materialId: { projectId: d.projectId, materialId: d.materialId } },
    update: data,
    create: { projectId: d.projectId, materialId: d.materialId, ...data },
  });
  await audit({ actorId: me.id, action: "EDIT", entityType: "BoqLine", entityId: row.id, after: d });
  redirect(`/m/material-master?tab=boq&project=${d.projectId}&saved=1`);
}

export async function uploadBoq(form: FormData) {
  const me = await requireRole(BOQ_EDIT_ROLES);
  const projectId = z.string().min(1).parse(form.get("projectId"));
  const file = form.get("file");
  if (!(file instanceof Blob) || file.size === 0 || file.size > 10 * 1024 * 1024) redirect(`/m/material-master?tab=boq&project=${projectId}&error=file`);
  const buf = Buffer.from(await (file as Blob).arrayBuffer());
  if (buf.subarray(0, 2).toString("latin1") !== "PK") redirect(`/m/material-master?tab=boq&project=${projectId}&error=file`);
  let res;
  try {
    res = await importBoq(projectId, buf);
  } catch {
    redirect(`/m/material-master?tab=boq&project=${projectId}&error=header`);
  }
  await audit({ actorId: me.id, action: "IMPORT", entityType: "BoqLine", entityId: projectId, after: res });
  redirect(`/m/material-master?tab=boq&project=${projectId}&imported=${res.updated}&added=${res.added}&skipped=${res.skipped.length}`);
}
