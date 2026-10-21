"use client";
import Dexie, { type Table } from "dexie";
import type { Mutation } from "@/lib/attendance/types";

type OutboxRow = Mutation & { tries: number; lastError?: string };
type CacheRow = { key: string; data: unknown; savedAt: number };

class KemDB extends Dexie {
  outbox!: Table<OutboxRow, string>;
  cache!: Table<CacheRow, string>;
  constructor() {
    super("kem-offline");
    this.version(1).stores({ outbox: "id, type, at", cache: "key" });
  }
}

let _db: KemDB | null = null;
const idb = () => (_db ??= new KemDB());

const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());
export function subscribeOutbox(fn: () => void) {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}

export async function pending(): Promise<Mutation[]> {
  return idb().outbox.orderBy("at").toArray();
}
export async function pendingCount(): Promise<number> {
  return idb().outbox.count();
}

export async function enqueue(m: Mutation) {
  await idb().outbox.put({ ...m, tries: 0 });
  notify();
  void flush();
}

export async function cacheGet<T>(key: string): Promise<T | undefined> {
  return (await idb().cache.get(key))?.data as T | undefined;
}
export async function cacheSet(key: string, data: unknown) {
  await idb().cache.put({ key, data, savedAt: Date.now() });
}

let flushing: Promise<void> | null = null;

/** Sends waiting mutations in order. Safe to call often; only one flush runs at a time. */
export function flush(): Promise<void> {
  if (flushing) return flushing;
  const run = async () => {
    try {
      if (typeof navigator !== "undefined" && !navigator.onLine) return;
      const batch = (await idb().outbox.orderBy("at").limit(100).toArray()).map(
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        ({ tries, lastError, ...m }) => m,
      );
      if (batch.length === 0) return;
      // A weak site signal can leave a request hanging; give up after 10 s and retry later.
      const res = await fetch("/api/sync", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mutations: batch }),
        signal: AbortSignal.timeout(10_000),
      });
      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }
      if (!res.ok) return;
      const { results } = (await res.json()) as { results: { id: string; result: string; reason?: string }[] };
      for (const r of results) {
        if (r.result === "error") {
          await idb().outbox.update(r.id, { lastError: "server error" });
        } else {
          // applied, duplicate and rejected all leave the queue (a rejected tap can never succeed)
          if (r.result === "rejected") console.warn("Sync rejected", r.id, r.reason);
          await idb().outbox.delete(r.id);
        }
      }
    } catch {
      // offline or server down: keep everything for the next try
    }
  };
  // Clear the flag in .finally (always async) – clearing it inside run() would happen
  // before the assignment when run() returns without awaiting, leaving flush stuck forever.
  flushing = run().finally(() => {
    flushing = null;
    notify();
  });
  return flushing;
}

let started = false;
/** Retry on reconnect and every 20 s. */
export function startSyncLoop() {
  if (started || typeof window === "undefined") return;
  started = true;
  window.addEventListener("online", () => void flush());
  setInterval(() => void flush(), 20_000);
  void flush();
}
