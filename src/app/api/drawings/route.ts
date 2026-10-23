import { z } from "zod";
import { withUser, jsonFor, ApiError } from "@/lib/api";
import { DISCIPLINES, DOC_TYPES, DRAWING_UPLOAD_ROLES, DRAWING_VIEW_ROLES, listDrawings, MAX_PDF_BYTES, uploadRevision } from "@/lib/drawings/server";
import { MutationError } from "@/lib/attendance/server";
import { UploadError } from "@/lib/files";

export const GET = withUser(async (user, req) => {
  const project = new URL(req.url).searchParams.get("project") || undefined;
  return jsonFor(user, { drawings: await listDrawings(user, project) });
}, DRAWING_VIEW_ROLES);

const meta = z.object({
  drawingId: z.string().optional(),
  projectId: z.string().optional(),
  docType: z.enum(DOC_TYPES).optional(),
  discipline: z.enum(DISCIPLINES).optional(),
  title: z.string().trim().max(200).optional(),
  rev: z.string().trim().min(1).max(10),
  status: z.enum(["DRAFT", "UNDER_REVIEW", "APPROVED", "APPROVED_WITH_COMMENTS", "REJECTED"]),
  notes: z.string().max(1000).optional(),
});

// POST multipart: file (PDF) + drawing fields → new drawing or new revision
export const POST = withUser(async (user, req) => {
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof Blob) || file.size === 0) throw new ApiError(400, "file_required");
  if (file.size > MAX_PDF_BYTES) throw new ApiError(400, "too_large");
  const f = (k: string) => (form.get(k) ? String(form.get(k)) : undefined);
  const d = meta.parse({ drawingId: f("drawingId"), projectId: f("projectId"), docType: f("docType"), discipline: f("discipline"), title: f("title"), rev: f("rev"), status: f("status"), notes: f("notes") });
  try {
    const { drawing, rev } = await uploadRevision(user, { ...d, buf: Buffer.from(await file.arrayBuffer()), name: file instanceof File ? file.name : undefined });
    return jsonFor(user, { drawingId: drawing.id, ref: drawing.ref, revisionId: rev.id });
  } catch (e) {
    if (e instanceof MutationError || e instanceof UploadError) throw new ApiError(e.message === "forbidden" ? 403 : 400, e.message);
    throw e;
  }
}, DRAWING_UPLOAD_ROLES);
