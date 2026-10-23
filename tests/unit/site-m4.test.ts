import { beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "crypto";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { db } from "@/lib/db";
import { applyMutation } from "@/lib/sync/apply";
import { saveUpload } from "@/lib/files";
import { act, flowView } from "@/lib/flows";
import { assignDuty } from "@/lib/site/duties";
import { answerQuery } from "@/lib/site/queries";
import type { CurrentUser } from "@/lib/auth/current";
import type { Mutation } from "@/lib/sync/schema";
import { SAFETY_ITEMS } from "@/lib/sync/schema";
import { resetDb } from "./reset";

process.env.UPLOAD_DIR = mkdtempSync(path.join(tmpdir(), "kem-up-"));
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1]);
const DATE = "2026-10-22";
const u: Record<string, CurrentUser> = {};
let NBK = "";
const mk = (id: string, roles: string[]): CurrentUser => ({ id, sessionId: "s", username: id, displayName: id, locale: "en", roles, mustChangePassword: false, prevSeenAt: null });
const mut = <T extends Mutation["type"]>(type: T, payload: Extract<Mutation, { type: T }>["payload"]) =>
  ({ id: randomUUID(), type, at: new Date().toISOString(), payload }) as Extract<Mutation, { type: T }>;
const photo = async (user: CurrentUser) => {
  const clientId = randomUUID();
  await saveUpload({ buf: JPEG, module: "reports", userId: user.id, clientId });
  return clientId;
};
const notes = (who: string) => db.notification.findMany({ where: { userId: u[who].id }, orderBy: { createdAt: "asc" } });

beforeAll(async () => {
  await resetDb();
  for (const [name, roles] of [["sanu", ["SUP"]], ["renjith", ["HEAD_SUP"]], ["sachin", ["SE"]], ["dinga", ["ADMIN", "PE"]], ["alwin", ["DESIGN"]]] as const) {
    const row = await db.user.create({ data: { username: name, displayName: name, passwordHash: "x", roles: { create: roles.map((role) => ({ role })) } } });
    u[name] = mk(row.id, [...roles]);
  }
  const site = await db.site.create({ data: { code: "NBK", name: "NBK" } });
  const project = await db.project.create({ data: { code: "NBK", name: "NBK", siteId: site.id } });
  NBK = project.id;
  await db.projectMember.createMany({ data: [
    { projectId: NBK, userId: u.sachin.id, role: "SE" },
    { projectId: NBK, userId: u.dinga.id, role: "PE" },
    { projectId: NBK, userId: u.sanu.id, role: "SUP" },
  ] });
});

describe("duties", () => {
  it("Renjith assigns with a deadline; Sanu marks done with a photo; SE and PE are notified", async () => {
    const duty = await assignDuty(u.renjith, { projectId: NBK, assigneeId: u.sanu.id, title: "Close ceiling grid B2", deadline: new Date(Date.now() + 3_600_000) });
    expect((await notes("sanu")).at(-1)?.title).toContain("Close ceiling grid B2");
    await expect(applyMutation(u.sanu, mut("duty.done", { dutyId: duty.id, photoClientId: randomUUID() }))).rejects.toThrow("photo_required");
    await applyMutation(u.sanu, mut("duty.done", { dutyId: duty.id, photoClientId: await photo(u.sanu), note: "Done" }));
    expect((await db.duty.findUniqueOrThrow({ where: { id: duty.id } })).status).toBe("DONE");
    expect((await notes("sachin")).some((n) => n.type === "DUTY_DONE")).toBe(true);
    expect((await notes("dinga")).some((n) => n.type === "DUTY_DONE")).toBe(true);
  });
  it("a supervisor cannot assign duties", async () => {
    await expect(assignDuty(u.sanu, { projectId: NBK, assigneeId: u.sanu.id, title: "x", deadline: new Date() })).rejects.toThrow("forbidden");
  });
});

describe("daily report: Supervisor → Head supervisor → Site engineer", () => {
  const report = async () => db.dailyReport.findFirstOrThrow({ where: { authorId: u.sanu.id } });
  const submit = async (work: string) =>
    applyMutation(u.sanu, mut("report.submit", {
      projectId: NBK, date: DATE, manpower: { own: 9, subs: [{ name: "MEPS", count: 4 }] }, workDone: work, photoClientIds: [await photo(u.sanu)],
    }));

  it("goes to Renjith first, SE is assigned the second step", async () => {
    await submit("Ducting level 2 – 40 m");
    const r = await report();
    expect(r.status).toBe("UNDER_REVIEW");
    expect((await flowView(u.renjith, "DAILY_REPORT", r.id))!.canAct).toBe(true);
    expect((await flowView(u.sachin, "DAILY_REPORT", r.id))!.canAct).toBe(false);
    expect(await db.attachment.count({ where: { entityId: r.id } })).toBe(1);
  });

  it("SE returning sends it back to Renjith; Renjith returning sends it to Sanu", async () => {
    const r = await report();
    let f = await flowView(u.renjith, "DAILY_REPORT", r.id);
    await act(u.renjith, f!.id, "APPROVE");
    f = await flowView(u.sachin, "DAILY_REPORT", r.id);
    expect(f!.canAct).toBe(true);
    await act(u.sachin, f!.id, "RETURN", "Add photos of level 2");
    expect((await flowView(u.renjith, "DAILY_REPORT", r.id))!.canAct).toBe(true);
    await act(u.renjith, f!.id, "RETURN", "Add photos of level 2");
    expect((await report()).status).toBe("RETURNED");
    expect((await notes("sanu")).at(-1)?.title).toContain("returned");
  });

  it("Sanu re-submits; both checks approve it", async () => {
    await submit("Ducting level 2 – 40 m, photos added");
    const r = await report();
    let f = await flowView(u.renjith, "DAILY_REPORT", r.id);
    expect(f!.status).toBe("IN_PROGRESS");
    await act(u.renjith, f!.id, "APPROVE");
    f = await flowView(u.sachin, "DAILY_REPORT", r.id);
    await act(u.sachin, f!.id, "APPROVE");
    expect((await report()).status).toBe("APPROVED");
    await expect(submit("again")).rejects.toThrow("already_submitted");
  });
});

describe("safety checklist", () => {
  const items = (issue?: { note?: string }) =>
    SAFETY_ITEMS.map((key) => ({ key, result: key === "fire" && issue ? ("ISSUE" as const) : ("OK" as const), note: key === "fire" ? issue?.note : undefined }));
  it("an issue needs a note and a photo, and alerts Renjith and the SE", async () => {
    await expect(applyMutation(u.sanu, mut("safety.submit", { projectId: NBK, date: DATE, items: items({}) }))).rejects.toThrow("issue_note_required");
    await expect(applyMutation(u.sanu, mut("safety.submit", { projectId: NBK, date: DATE, items: items({ note: "Extinguisher missing" }) }))).rejects.toThrow("issue_photo_required");
    await applyMutation(u.sanu, mut("safety.submit", { projectId: NBK, date: DATE, items: items({ note: "Extinguisher missing" }), photoClientId: await photo(u.sanu) }));
    expect((await db.safetyChecklist.findFirstOrThrow()).issues).toBe(1);
    expect((await notes("renjith")).some((n) => n.type === "SAFETY")).toBe(true);
  });
  it("all OK needs no photo", async () => {
    await applyMutation(u.sanu, mut("safety.submit", { projectId: NBK, date: DATE, items: items() }));
    expect(await db.safetyChecklist.count()).toBe(2);
  });
});

describe("site queries", () => {
  it("Sanu asks with a photo → Design notified → Alwin answers → Sanu notified", async () => {
    await applyMutation(u.sanu, mut("query.create", { projectId: NBK, subject: "FCU clash with beam", question: "Lower by 100 mm?", discipline: "HVAC", photoClientIds: [await photo(u.sanu)] }));
    const q = await db.siteQuery.findFirstOrThrow();
    expect(q.ref).toBe("NBK-SQ-001");
    expect((await notes("alwin")).at(-1)?.title).toContain("NBK-SQ-001");
    await expect(answerQuery(u.sanu, q.id, "x")).rejects.toThrow("forbidden");
    await answerQuery(u.alwin, q.id, "Yes, lower by 100 mm – see SK-12");
    expect((await db.siteQuery.findUniqueOrThrow({ where: { id: q.id } })).status).toBe("ANSWERED");
    expect((await notes("sanu")).at(-1)?.title).toContain("answered");
    await applyMutation(u.sanu, mut("query.create", { projectId: NBK, subject: "Second", question: "?", photoClientIds: [] }));
    expect((await db.siteQuery.findFirstOrThrow({ where: { subject: "Second" } })).ref).toBe("NBK-SQ-002");
  });
});
