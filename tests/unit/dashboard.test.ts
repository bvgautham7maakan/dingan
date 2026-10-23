import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { bucketOf, groupPending, pendingItems } from "@/lib/dashboard/pending";
import { manDays } from "@/lib/dashboard/summary";
import { dubaiDateTime, todayDubai } from "@/lib/time";
import { startFlow } from "@/lib/approvals";
import type { CurrentUser } from "@/lib/auth/current";
import { resetDb } from "./reset";
import "@/lib/flows";

const H = 3_600_000;
const u: Record<string, CurrentUser> = {};
const mk = (id: string, roles: string[]): CurrentUser => ({ id, sessionId: "s", username: id, displayName: id, locale: "en", roles, mustChangePassword: false, prevSeenAt: null });

describe("pending grouping", () => {
  const now = dubaiDateTime("2026-10-21", "09:00");
  it("overdue → today → this week → later", () => {
    expect(bucketOf(new Date(now.getTime() - H), now)).toBe("overdue");
    expect(bucketOf(dubaiDateTime("2026-10-21", "18:00"), now)).toBe("today");
    expect(bucketOf(dubaiDateTime("2026-10-24", "18:00"), now)).toBe("week");
    expect(bucketOf(dubaiDateTime("2026-11-21", "18:00"), now)).toBe("later");
  });
  it("sorts each group by due time", () => {
    const g = groupPending(
      [
        { key: "b", title: "b", link: "/", kind: "x", due: dubaiDateTime("2026-10-21", "17:00") },
        { key: "a", title: "a", link: "/", kind: "x", due: dubaiDateTime("2026-10-21", "10:00") },
        { key: "c", title: "c", link: "/", kind: "x", due: new Date(now.getTime() - 5 * H) },
      ],
      now,
    );
    expect(g.overdue.map((i) => i.key)).toEqual(["c"]);
    expect(g.today.map((i) => i.key)).toEqual(["a", "b"]);
  });
});

describe("pending items per role", () => {
  let nbk = "";
  beforeAll(async () => {
    await resetDb();
    for (const [name, roles] of [["sanu", ["SUP"]], ["renjith", ["HEAD_SUP"]], ["alwin", ["DESIGN"]], ["ali", ["DRIVER"]]] as const) {
      const row = await db.user.create({ data: { username: name, displayName: name, passwordHash: "x", roles: { create: roles.map((role) => ({ role })) } } });
      u[name] = mk(row.id, [...roles]);
    }
    const site = await db.site.create({ data: { code: "NBK", name: "NBK" } });
    nbk = (await db.project.create({ data: { code: "NBK", name: "NBK", siteId: site.id, manDayBudget: 100 } })).id;
    await db.projectMember.create({ data: { projectId: nbk, userId: u.sanu.id, role: "SUP" } });
    const w = await db.worker.create({ data: { empCode: "E01", name: "A" } });
    await db.dayPlan.create({ data: { date: todayDubai(), createdById: u.renjith.id, lines: { create: [{ workerId: w.id, siteId: site.id }] } } });
    await db.vehicle.create({ data: { name: "Vehicle 1", defaultDriverId: u.ali.id } });
  });

  it("supervisor: attendance, safety and report for each assigned site", async () => {
    const kinds = (await pendingItems(u.sanu)).map((i) => i.kind).sort();
    expect(kinds).toEqual(["attendance", "report", "safety"]);
  });

  it("head supervisor: approvals with a 24 h target", async () => {
    const m = await db.manpowerMove.create({ data: { date: todayDubai(), fromSiteId: (await db.site.findFirstOrThrow()).id, toSiteId: (await db.site.findFirstOrThrow()).id, moveAt: new Date(), reason: "EXTRA", createdById: u.sanu.id } });
    await startFlow("MANPOWER_MOVE", m.id, "MOVE", [{ label: "Head supervisor", role: "HEAD_SUP" }], u.sanu);
    const items = await pendingItems(u.renjith);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: "approval", link: "/m/moves" });
    expect(items[0].due.getTime() - Date.now()).toBeGreaterThan(23 * H);
    expect(await pendingItems(u.sanu)).not.toContainEqual(expect.objectContaining({ kind: "approval" }));
  });

  it("design: open site queries; driver: vehicle check", async () => {
    await db.siteQuery.create({ data: { ref: "NBK-SQ-001", projectId: nbk, raisedById: u.sanu.id, subject: "Clash", question: "?" } });
    expect((await pendingItems(u.alwin)).map((i) => i.kind)).toEqual(["query"]);
    expect((await pendingItems(u.ali)).map((i) => i.kind)).toEqual(["vehicle"]);
  });

  it("man-days count a moved worker by share of the day", async () => {
    const site2 = await db.site.create({ data: { code: "SAFE", name: "Safe" } });
    const att = await db.attendance.create({ data: { date: "2026-10-21", workerId: (await db.worker.findFirstOrThrow()).id, siteId: (await db.site.findFirstOrThrow({ where: { code: "NBK" } })).id, status: "IN", markedById: u.sanu.id } });
    await db.workSegment.create({ data: { attendanceId: att.id, siteId: att.siteId, projectId: nbk, startAt: dubaiDateTime("2026-10-21", "08:00"), endAt: dubaiDateTime("2026-10-21", "11:00") } });
    await db.workSegment.create({ data: { attendanceId: att.id, siteId: site2.id, startAt: dubaiDateTime("2026-10-21", "11:00"), endAt: dubaiDateTime("2026-10-21", "17:00") } });
    expect(await manDays(nbk)).toEqual({ used: 0.3, budget: 100 });
  });
});
