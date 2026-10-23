"use client";
// "Save offline" for drawings: the PDF and the viewer page go into a cache the service worker reads when there is no signal.
const CACHE = "kem-drawings";

export async function saveDrawingOffline(revisionId: string, fileId: string) {
  const c = await caches.open(CACHE);
  await c.addAll([`/api/files/${fileId}`, `/m/drawings/${revisionId}`]);
  localStorage.setItem(`kem-offline:${revisionId}`, fileId);
}

export async function removeDrawingOffline(revisionId: string, fileId: string) {
  const c = await caches.open(CACHE);
  await Promise.all([c.delete(`/api/files/${fileId}`), c.delete(`/m/drawings/${revisionId}`)]);
  localStorage.removeItem(`kem-offline:${revisionId}`);
}

export async function isDrawingOffline(fileId: string) {
  if (typeof caches === "undefined") return false;
  return !!(await (await caches.open(CACHE)).match(`/api/files/${fileId}`));
}
