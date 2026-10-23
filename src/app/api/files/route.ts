import { z } from "zod";
import { withUser, jsonFor, ApiError } from "@/lib/api";
import { MODULES, saveUpload, UploadError } from "@/lib/files";

const meta = z.object({
  clientId: z.string().uuid(),
  module: z.enum(MODULES),
  projectId: z.string().optional(),
});

// POST multipart: file, clientId, module[, projectId] → { id }
export const POST = withUser(async (user, req) => {
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof Blob)) throw new ApiError(400, "file_required");
  const m = meta.parse({
    clientId: form.get("clientId"),
    module: form.get("module"),
    projectId: form.get("projectId") || undefined,
  });
  try {
    const saved = await saveUpload({
      buf: Buffer.from(await file.arrayBuffer()),
      module: m.module,
      userId: user.id,
      clientId: m.clientId,
      projectId: m.projectId,
      originalName: file instanceof File ? file.name : null,
      allow: ["PHOTO", "VOICE"],
    });
    return jsonFor(user, { id: saved.id, kind: saved.kind });
  } catch (e) {
    if (e instanceof UploadError) throw new ApiError(e.message === "forbidden" ? 403 : 400, e.message);
    throw e;
  }
});
