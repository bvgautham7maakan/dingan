// @vitest-environment node
import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "crypto";
import type { Mutation } from "@/lib/attendance/types";

const m = (): Mutation => ({
  id: randomUUID(), type: "attendance.clear", at: new Date().toISOString(), payload: { date: "2026-10-21", workerId: "w1" },
});

let online = false;
beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal("navigator", { get onLine() { return online; } });
  vi.stubGlobal("window", { location: { href: "" }, addEventListener: () => {} });
});
afterEach(() => vi.unstubAllGlobals());

describe("offline outbox", () => {
  it("keeps taps while offline and sends them once back online (no stuck flush)", async () => {
    const box = await import("@/lib/offline/outbox");
    online = false;
    await box.enqueue(m());
    await box.enqueue(m());
    await box.flush(); // returns immediately while offline – must not stay "busy"
    expect(await box.pendingCount()).toBe(2);

    const fetchMock = vi.fn(async (_url: string, init: { body: string }) => {
      const { mutations } = JSON.parse(init.body);
      return new Response(JSON.stringify({ results: mutations.map((x: Mutation) => ({ id: x.id, result: "applied" })) }));
    });
    vi.stubGlobal("fetch", fetchMock);
    online = true;
    await box.flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(await box.pendingCount()).toBe(0);
  });

  it("keeps mutations the server could not store and drops rejected ones", async () => {
    const box = await import("@/lib/offline/outbox");
    online = true;
    vi.stubGlobal("fetch", vi.fn(async () => new Response("down", { status: 503 })));
    const a = m();
    const b = m();
    await box.enqueue(a);
    await box.enqueue(b);
    await box.flush();
    const before = await box.pendingCount();
    expect(before).toBeGreaterThanOrEqual(2);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ results: [{ id: a.id, result: "error" }, { id: b.id, result: "rejected" }] }))));
    await box.flush();
    const left = (await box.pending()).map((x) => x.id);
    expect(left).toContain(a.id);
    expect(left).not.toContain(b.id);
  });
});
