import "server-only";
import { createHash } from "crypto";
import { copyFile, mkdir, writeFile } from "fs/promises";
import path from "path";
import { db } from "./db";

export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
export const MODULES = ["attendance", "moves", "logistics", "bills", "reports", "safety", "queries", "duties", "materials", "drawings", "exports"] as const;
export type UploadModule = (typeof MODULES)[number];

type Sniffed = { mime: string; ext: string; kind: "PHOTO" | "VOICE" | "PDF" };

/** Detects the real file type from its first bytes. The browser's claimed type is not trusted. */
export function sniff(buf: Buffer): Sniffed | null {
  const at = (i: number, bytes: number[]) => bytes.every((b, j) => buf[i + j] === b);
  const ascii = (i: number, s: string) => buf.subarray(i, i + s.length).toString("latin1") === s;
  if (at(0, [0xff, 0xd8, 0xff])) return { mime: "image/jpeg", ext: "jpg", kind: "PHOTO" };
  if (at(0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { mime: "image/png", ext: "png", kind: "PHOTO" };
  if (ascii(0, "RIFF") && ascii(8, "WEBP")) return { mime: "image/webp", ext: "webp", kind: "PHOTO" };
  if (ascii(0, "%PDF-")) return { mime: "application/pdf", ext: "pdf", kind: "PDF" };
  if (at(0, [0x1a, 0x45, 0xdf, 0xa3])) return { mime: "audio/webm", ext: "webm", kind: "VOICE" };
  if (ascii(0, "OggS")) return { mime: "audio/ogg", ext: "ogg", kind: "VOICE" };
  if (ascii(4, "ftyp")) return { mime: "audio/mp4", ext: "m4a", kind: "VOICE" }; // iPhone voice notes
  if (ascii(0, "RIFF") && ascii(8, "WAVE")) return { mime: "audio/wav", ext: "wav", kind: "VOICE" };
  return null;
}

const uploadRoot = () => path.resolve(process.env.UPLOAD_DIR || "data/uploads");

export class UploadError extends Error {}

/**
 * Stores an upload under data/uploads/<project>/<module>/<yyyy-mm>/<id>.<ext>.
 * Idempotent per clientId (an offline retry returns the same file).
 */
export async function saveUpload(opts: {
  buf: Buffer;
  module: UploadModule;
  userId: string;
  clientId?: string | null;
  projectId?: string | null;
  originalName?: string | null;
  allow?: Sniffed["kind"][];
}) {
  if (opts.clientId) {
    const existing = await db.fileObject.findUnique({ where: { clientId: opts.clientId } });
    if (existing) {
      if (existing.uploadedById !== opts.userId) throw new UploadError("forbidden");
      return existing;
    }
  }
  if (opts.buf.length === 0 || opts.buf.length > MAX_UPLOAD_BYTES) throw new UploadError("bad_size");
  const type = sniff(opts.buf);
  if (!type || (opts.allow && !opts.allow.includes(type.kind))) throw new UploadError("bad_type");

  const project = opts.projectId ? await db.project.findUnique({ where: { id: opts.projectId } }) : null;
  const month = new Date().toISOString().slice(0, 7);
  const dir = path.join(uploadRoot(), project?.code ?? "GENERAL", opts.module, month);
  await mkdir(dir, { recursive: true });
  const sha256 = createHash("sha256").update(opts.buf).digest("hex");
  const row = await db.fileObject.create({
    data: {
      path: "", mime: type.mime, size: opts.buf.length, sha256, kind: type.kind, module: opts.module,
      projectId: project?.id ?? null, uploadedById: opts.userId, clientId: opts.clientId ?? null,
      originalName: opts.originalName?.slice(0, 200) ?? null,
    },
  });
  const file = path.join(dir, `${row.id}.${type.ext}`);
  await writeFile(file, opts.buf);
  const rel = path.relative(uploadRoot(), file);
  const saved = await db.fileObject.update({ where: { id: row.id }, data: { path: rel } });
  await mirror(saved.id, file, project?.oneDrivePath ?? null, opts.module).catch((e) => console.error("mirror failed", e));
  return saved;
}

/**
 * Copies the file into the project's OneDrive job folder, sub-folder "KEM App uploads".
 * Off unless ONEDRIVE_MIRROR=true; only writes inside the path an admin set on the project.
 */
async function mirror(id: string, file: string, oneDrivePath: string | null, module: string) {
  if (process.env.ONEDRIVE_MIRROR !== "true" || !oneDrivePath) return;
  const dest = path.join(oneDrivePath, "KEM App uploads", module);
  await mkdir(dest, { recursive: true });
  await copyFile(file, path.join(dest, path.basename(file)));
  await db.fileObject.update({ where: { id }, data: { mirroredAt: new Date() } });
}

export function absolutePath(rel: string) {
  const abs = path.resolve(uploadRoot(), rel);
  if (!abs.startsWith(uploadRoot() + path.sep)) throw new UploadError("bad_path");
  return abs;
}

/** Resolves an offline client file id (sent with a mutation) to the stored file. */
export async function fileByClientId(clientId: string | undefined | null, userId: string) {
  if (!clientId) return null;
  const f = await db.fileObject.findUnique({ where: { clientId } });
  return f && f.uploadedById === userId ? f : null;
}
