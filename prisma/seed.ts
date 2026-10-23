/* KEM pilot seed: users, roles, sites, projects, vehicles, subcontractors, workers, holidays, settings.
 * Idempotent: safe to run again (upserts by natural key). Demo transactions arrive with later milestones.
 */
import { PrismaClient } from "@prisma/client";
import { hash } from "@node-rs/argon2";
import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { createHash } from "crypto";
import path from "path";
import { drawingPdf } from "./demo-pdf";

const db = new PrismaClient();
const TEMP = process.env.SEED_TEMP_PASSWORD || "Kem@Temp2026";

type U = { username: string; displayName: string; fullName: string; roles: string[] };

const USERS: U[] = [
  { username: "dinga", displayName: "Dinga", fullName: "Gautham B V", roles: ["ADMIN", "PE"] },
  { username: "nobin", displayName: "Nobin", fullName: "Nobin Varghese", roles: ["BUL"] },
  { username: "yadhu.v", displayName: "Yadhu V", fullName: "Yadhukrishnan Vattaparambil", roles: ["OPS"] },
  { username: "yadhu.s", displayName: "Yadhu S", fullName: "Yadhukrishnan S", roles: ["PM"] },
  { username: "sachin", displayName: "Sachin", fullName: "Sachin", roles: ["SE"] },
  { username: "deepak", displayName: "Deepak", fullName: "Deepak", roles: ["EST"] },
  { username: "alwin", displayName: "Alwin", fullName: "Alwin Joneson", roles: ["DESIGN"] },
  { username: "aswin", displayName: "Aswin", fullName: "Aswin", roles: ["COORD"] },
  { username: "azhar", displayName: "Azhar", fullName: "Azhar", roles: ["PROC"] },
  { username: "renjith", displayName: "Renjith", fullName: "Renjith A R", roles: ["HEAD_SUP"] },
  { username: "vishnu", displayName: "Vishnu", fullName: "Vishnu", roles: ["SUP"] },
  { username: "aneesh", displayName: "Aneesh", fullName: "Aneesh Mon", roles: ["SUP"] },
  { username: "sanu", displayName: "Sanu", fullName: "Sanu Sajan", roles: ["SUP"] },
  { username: "jitendar", displayName: "Jitendar", fullName: "Jitendar", roles: ["HVAC_SUP"] },
  { username: "ali", displayName: "Ali", fullName: "Ali", roles: ["DRIVER"] },
];

const SITES = [
  { code: "NBK", name: "NBK", kind: "PROJECT" },
  { code: "SAFE", name: "Safe Tower", kind: "PROJECT" },
  { code: "MANG", name: "Mangrove", kind: "PROJECT" },
  { code: "NYU", name: "NYU", kind: "PROJECT" },
  { code: "SNS", name: "Sugar & Salt", kind: "PROJECT" },
  { code: "KAMAL", name: "Kamal Villa", kind: "PROJECT" },
  { code: "FAB", name: "Fabrica", kind: "PROJECT" },
  { code: "OFFICE", name: "Office", kind: "OFFICE" },
  { code: "STORE", name: "Store", kind: "STORE" },
];

// Project code, site code, PM?, assigned staff (usernames)
const PROJECTS: { code: string; name: string; site: string; pm: boolean; staff: string[]; client?: string }[] = [
  { code: "NBK", name: "NBK", site: "NBK", pm: true, staff: ["dinga", "sachin", "renjith", "sanu", "jitendar"], client: "Group Three" },
  { code: "SAFE", name: "Safe Tower", site: "SAFE", pm: true, staff: ["dinga", "sachin", "renjith", "vishnu"], client: "Group Three" },
  { code: "MANG", name: "Mangrove", site: "MANG", pm: false, staff: ["dinga", "renjith", "aneesh"], client: "Group Three" },
  { code: "NYU", name: "NYU", site: "NYU", pm: false, staff: ["renjith"] },
  { code: "SNS", name: "Sugar & Salt", site: "SNS", pm: false, staff: ["renjith"] },
  { code: "KAMAL", name: "Kamal Villa", site: "KAMAL", pm: false, staff: ["renjith"] },
  { code: "FAB", name: "Fabrica", site: "FAB", pm: false, staff: ["renjith"], client: "Fabrica" },
];

// UAE public holidays. Islamic dates are moon-sighting estimates – correct them in Admin › Public holidays.
const HOLIDAYS: [string, string][] = [
  ["2026-01-01", "New Year's Day"],
  ["2026-03-19", "Eid Al Fitr (est.)"],
  ["2026-03-20", "Eid Al Fitr (est.)"],
  ["2026-03-21", "Eid Al Fitr (est.)"],
  ["2026-05-26", "Arafat Day (est.)"],
  ["2026-05-27", "Eid Al Adha (est.)"],
  ["2026-05-28", "Eid Al Adha (est.)"],
  ["2026-05-29", "Eid Al Adha (est.)"],
  ["2026-06-16", "Hijri New Year (est.)"],
  ["2026-08-28", "Public holiday (Prophet's Birthday)"],
  ["2026-12-01", "Commemoration Day"],
  ["2026-12-02", "National Day"],
  ["2026-12-03", "National Day"],
  ["2027-01-01", "New Year's Day"],
  ["2027-03-09", "Eid Al Fitr (est.)"],
  ["2027-03-10", "Eid Al Fitr (est.)"],
  ["2027-03-11", "Eid Al Fitr (est.)"],
  ["2027-05-15", "Arafat Day (est.)"],
  ["2027-05-16", "Eid Al Adha (est.)"],
  ["2027-05-17", "Eid Al Adha (est.)"],
  ["2027-05-18", "Eid Al Adha (est.)"],
  ["2027-06-06", "Hijri New Year (est.)"],
  ["2027-08-14", "Prophet's Birthday (est.)"],
  ["2027-12-01", "Commemoration Day"],
  ["2027-12-02", "National Day"],
  ["2027-12-03", "National Day"],
];

async function main() {
  const passwordHash = await hash(TEMP, { memoryCost: 19456, timeCost: 2, parallelism: 1 });
  const ids: Record<string, string> = {};

  for (const u of USERS) {
    const row = await db.user.upsert({
      where: { username: u.username },
      update: { displayName: u.displayName, fullName: u.fullName },
      create: { username: u.username, displayName: u.displayName, fullName: u.fullName, passwordHash, mustChangePassword: true },
    });
    ids[u.username] = row.id;
    for (const role of u.roles) {
      await db.userRole.upsert({
        where: { userId_role: { userId: row.id, role } },
        update: {},
        create: { userId: row.id, role },
      });
    }
  }

  const siteIds: Record<string, string> = {};
  for (const s of SITES) {
    const row = await db.site.upsert({ where: { code: s.code }, update: { name: s.name, kind: s.kind }, create: s });
    siteIds[s.code] = row.id;
  }

  const roleOf = (username: string) => USERS.find((u) => u.username === username)!.roles.find((r) => r !== "ADMIN")!;
  for (const p of PROJECTS) {
    const row = await db.project.upsert({
      where: { code: p.code },
      update: { name: p.name, siteId: siteIds[p.site], pmUserId: p.pm ? ids["yadhu.s"] : null, client: p.client },
      create: { code: p.code, name: p.name, siteId: siteIds[p.site], pmUserId: p.pm ? ids["yadhu.s"] : null, client: p.client },
    });
    const staff = p.pm ? [...p.staff, "yadhu.s"] : p.staff;
    for (const username of staff) {
      const role = roleOf(username);
      await db.projectMember.upsert({
        where: { projectId_userId_role: { projectId: row.id, userId: ids[username], role } },
        update: {},
        create: { projectId: row.id, userId: ids[username], role },
      });
    }
  }

  const vehicles = [
    { name: "Vehicle 1", defaultDriverId: ids["ali"] },
    { name: "Vehicle 2", defaultDriverId: null },
    { name: "Vehicle 3", defaultDriverId: null },
  ];
  for (const v of vehicles) await db.vehicle.upsert({ where: { name: v.name }, update: {}, create: v });

  const subs = [
    { name: "Traditional", disciplines: "ELE,PLB" },
    { name: "MEPS", disciplines: "HVAC,FLS" },
    { name: "Mepro", disciplines: "HVAC" },
  ];
  for (const s of subs) await db.subcontractor.upsert({ where: { name: s.name }, update: {}, create: s });

  // Workers from the timesheet workbook's Employees sheet (reference/employees.json, no salary data).
  type Emp = { empCode: string; name: string | null; status: string; lastDay: string | null };
  const emps = JSON.parse(readFileSync("reference/employees.json", "utf8")) as Emp[];
  for (const e of emps) {
    const data = { name: e.name ?? `Employee ${e.empCode.slice(1)}`, status: e.status, lastDay: e.lastDay };
    await db.worker.upsert({ where: { empCode: e.empCode }, update: data, create: { empCode: e.empCode, ...data } });
  }

  for (const [date, name] of HOLIDAYS)
    await db.publicHoliday.upsert({ where: { date }, update: {}, create: { date, name } });

  const settings: [string, unknown][] = [
    ["bulThresholdFils", 100_000 * 100],
    ["cycleStartDay", 26],
    ["dayShiftStart", "08:00"],
    ["nightShiftStart", "23:00"],
    ["eveningShiftStart", "20:00"],
    // timesheet rules – same values as the reference workbook's Settings sheet
    ["ts.normalHours", 8],
    ["ts.lunchHours", 1],
    ["ts.lunchAfterHours", 5],
    ["ts.otNormalRate", 1.25],
    ["ts.otHolidayRate", 1.5],
  ];
  for (const [key, value] of settings)
    await db.setting.upsert({ where: { key }, update: {}, create: { key, value: value as never } });

  await seedDemoAttendance(ids["renjith"], ids["sanu"]);
  await seedDemoLogistics(ids);
  await seedDemoSite(ids);
  await seedMaterials();
  await seedDemoMaterials(ids);
  await seedDemoDrawings(ids);

  console.log(`Seeded ${USERS.length} users (temporary password: ${TEMP}), ${SITES.length} sites, ${PROJECTS.length} projects, ${emps.length} workers.`);
}

/** Demo: today's plan (NBK crew) and yesterday's attendance with finish times. Skipped if any plan exists. */
async function seedDemoAttendance(renjithId: string, sanuId: string) {
  if ((await db.dayPlan.count()) > 0) return;
  const dubaiDay = (offset: number) => {
    const d = new Date(Date.now() + 4 * 3_600_000 + offset * 86_400_000);
    return d.toISOString().slice(0, 10);
  };
  const at = (day: string, hhmm: string) => {
    const [y, m, d] = day.split("-").map(Number);
    const [h, min] = hhmm.split(":").map(Number);
    return new Date(Date.UTC(y, m - 1, d, h - 4, min));
  };
  const sites = Object.fromEntries((await db.site.findMany()).map((s) => [s.code, s]));
  const projects = Object.fromEntries((await db.project.findMany()).map((p) => [p.code, p]));
  const v1 = await db.vehicle.findUniqueOrThrow({ where: { name: "Vehicle 1" } });
  const v2 = await db.vehicle.findUniqueOrThrow({ where: { name: "Vehicle 2" } });
  const workers = await db.worker.findMany({ where: { status: "ACTIVE" }, orderBy: { empCode: "asc" } });
  const crew = (i: number) => (i < 12 ? "NBK" : i < 20 ? "SAFE" : "MANG");

  for (const day of [dubaiDay(-1), dubaiDay(0)]) {
    await db.dayPlan.create({
      data: {
        date: day, createdById: renjithId, status: "FINAL",
        lines: { create: workers.map((w, i) => ({ workerId: w.id, siteId: sites[crew(i)].id, vehicleId: crew(i) === "NBK" ? v1.id : v2.id })) },
      },
    });
  }
  // Yesterday at NBK: 08:00–17:00, one late at 08:20, one sick, two staying until 19:00.
  const y = dubaiDay(-1);
  if (new Date(y + "T00:00:00Z").getUTCDay() === 0) return; // no demo attendance on a Sunday
  for (const [i, w] of workers.slice(0, 12).entries()) {
    const sick = i === 2;
    const inT = i === 1 ? "08:20" : "08:00";
    const outT = i === 4 || i === 5 ? "19:00" : "17:00";
    const rec = await db.attendance.create({
      data: {
        date: y, workerId: w.id, siteId: sites.NBK.id, status: sick ? "OUT" : i === 1 ? "LATE" : "IN", leaveCode: sick ? "SL" : null,
        shift: "DAY", shiftStart: "08:00", inAt: sick ? null : at(y, inT), outAt: sick ? null : at(y, outT), markedById: sanuId,
      },
    });
    if (!sick)
      await db.workSegment.create({ data: { attendanceId: rec.id, siteId: sites.NBK.id, projectId: projects.NBK.id, startAt: at(y, inT), endAt: at(y, outT) } });
  }
}

/** Demo: today's trips (Vehicle 3 double-booked) and yesterday's 10:15 emergency move awaiting Renjith. */
async function seedDemoLogistics(ids: Record<string, string>) {
  if ((await db.trip.count()) > 0) return;
  const day = (offset: number) => new Date(Date.now() + 4 * 3_600_000 + offset * 86_400_000).toISOString().slice(0, 10);
  const at = (d: string, hhmm: string) => {
    const [y, m, dd] = d.split("-").map(Number);
    const [h, min] = hhmm.split(":").map(Number);
    return new Date(Date.UTC(y, m - 1, dd, h - 4, min));
  };
  const site = Object.fromEntries((await db.site.findMany()).map((s) => [s.code, s.id]));
  const veh = Object.fromEntries((await db.vehicle.findMany()).map((v) => [v.name, v.id]));
  const today = day(0);
  const plan = await db.vehiclePlan.create({ data: { date: today, status: "DRAFT" } });
  const trips: [string, string | null, string, string, string, string, string][] = [
    ["Vehicle 1", ids["ali"], "STORE", "NBK", "07:00", "08:30", "Cable drums + 12 workers"],
    ["Vehicle 1", ids["ali"], "STORE", "SAFE", "10:00", "11:30", "Duct material"],
    ["Vehicle 2", ids["vishnu"], "OFFICE", "SAFE", "07:30", "08:15", "Crew drop"],
    ["Vehicle 3", ids["aneesh"], "STORE", "MANG", "09:00", "11:00", "PPR pipes"],
    ["Vehicle 3", ids["sanu"], "NBK", "SAFE", "10:15", "11:00", "Emergency crew"],
  ];
  for (const [v, driverId, from, to, out, back, purpose] of trips)
    await db.trip.create({
      data: { planId: plan.id, date: today, vehicleId: veh[v], driverId, fromSiteId: site[from], toSiteId: site[to], plannedOut: at(today, out), plannedReturn: at(today, back), purpose },
    });

  // yesterday's emergency move at 10:15 (only if the demo attendance exists)
  const y = day(-1);
  const workers = await db.worker.findMany({ where: { empCode: { in: ["E05", "E06", "E07"] } } });
  const atts = await db.attendance.findMany({ where: { date: y, workerId: { in: workers.map((w) => w.id) } }, include: { segments: true } });
  if (atts.length !== 3) return;
  const moveAt = at(y, "10:15");
  const project = await db.project.findUnique({ where: { code: "SAFE" } });
  const move = await db.manpowerMove.create({
    data: {
      date: y, fromSiteId: site.NBK, toSiteId: site.SAFE, moveAt, reason: "EMERGENCY", note: "Ceiling closing today – client inspection",
      status: "APPLIED", appliedAt: moveAt, createdById: ids["sanu"], workers: { create: workers.map((w) => ({ workerId: w.id })) },
    },
  });
  for (const a of atts) {
    const seg = a.segments[0];
    await db.workSegment.update({ where: { id: seg.id }, data: { endAt: moveAt } });
    await db.workSegment.create({ data: { attendanceId: a.id, siteId: site.SAFE, projectId: project?.id, startAt: moveAt, endAt: seg.endAt, source: "MOVE", moveId: move.id } });
  }
  await db.approvalFlow.create({
    data: {
      entityType: "MANPOWER_MOVE", entityId: move.id, chainCode: "MOVE", createdById: ids["sanu"],
      steps: { create: [{ seq: 1, label: "Head supervisor", role: "HEAD_SUP", status: "PENDING" }] },
    },
  });
  await db.notification.create({
    data: { userId: ids["renjith"], type: "APPROVAL", title: "Move 3 worker(s) NBK → Safe Tower at 10:15 (Emergency) – waiting for you", link: "/m/moves", entityType: "MANPOWER_MOVE", entityId: move.id },
  });
}

/** Demo: duties (one overdue), 2 site queries (one answered), a safety check, a report waiting for Renjith. */
async function seedDemoSite(ids: Record<string, string>) {
  if ((await db.duty.count()) > 0 || (await db.siteQuery.count()) > 0) return;
  const nbk = await db.project.findUniqueOrThrow({ where: { code: "NBK" } });
  const safe = await db.project.findUniqueOrThrow({ where: { code: "SAFE" } });
  const today = new Date(Date.now() + 4 * 3_600_000).toISOString().slice(0, 10);
  const h = (hours: number) => new Date(Date.now() + hours * 3_600_000);
  await db.duty.createMany({
    data: [
      { projectId: nbk.id, title: "Pressure test CHW risers level 1–3", assignedById: ids["renjith"], assigneeId: ids["sanu"], deadline: h(-20) },
      { projectId: nbk.id, title: "Close ceiling grid B2 after FCU install", assignedById: ids["renjith"], assigneeId: ids["sanu"], deadline: h(5) },
      { projectId: safe.id, title: "Shift cable drums to level 4", assignedById: ids["renjith"], assigneeId: ids["vishnu"], deadline: h(30) },
    ],
  });
  const q1 = await db.siteQuery.create({
    data: {
      ref: "NBK-SQ-001", projectId: nbk.id, raisedById: ids["sanu"], discipline: "HVAC", drawingRef: "NBK-SHD-HVAC-005",
      subject: "FCU-12 clashes with beam at grid C4", question: "Can FCU-12 be lowered by 100 mm or moved 300 mm towards grid C5?",
    },
  });
  await db.siteQuery.create({
    data: {
      ref: "NBK-SQ-002", projectId: nbk.id, raisedById: ids["jitendar"], discipline: "HVAC", subject: "Duct size at corridor L2",
      question: "Drawing shows 600x300 but space allows 500x300 only. Confirm alternative.", status: "ANSWERED",
      answer: "Use 700x250 – same area. Revised sketch SK-HVAC-021 to follow.", answeredById: ids["alwin"], answeredAt: h(-2),
    },
  });
  await db.notification.create({ data: { userId: ids["alwin"], type: "QUERY", title: `${q1.ref}: ${q1.subject}`, link: `/m/site-queries/${q1.id}`, entityType: "SITE_QUERY", entityId: q1.id } });
  const keys = ["ppe", "toolbox", "housekeeping", "access", "workAtHeight", "electrical", "tools", "fire", "firstAid", "permits", "barricade", "welfare"];
  await db.safetyChecklist.create({
    data: {
      projectId: nbk.id, date: today, byId: ids["sanu"], issues: 1,
      items: keys.map((key) => (key === "barricade" ? { key, result: "ISSUE", note: "Shaft opening at L3 not barricaded" } : { key, result: "OK" })),
    },
  });
  const yesterday = new Date(Date.now() + 4 * 3_600_000 - 86_400_000).toISOString().slice(0, 10);
  const report = await db.dailyReport.create({
    data: {
      projectId: nbk.id, date: yesterday, authorId: ids["sanu"], status: "UNDER_REVIEW",
      manpower: { own: 11, subs: [{ name: "MEPS", count: 4 }], attendance: { present: 11, late: 1, leave: ["Aneesh (SL)"], movedIn: 0, movedOut: 3 } },
      workDone: "GI ducting level 2 grid C–D (36 m). CHW insulation level 1 (20 m).", issues: "FCU-12 clash with beam – query NBK-SQ-001 raised.",
      nextDay: "Ducting grid D–E, FCU-13/14 hanging.",
    },
  });
  await db.approvalFlow.create({
    data: {
      entityType: "DAILY_REPORT", entityId: report.id, chainCode: "DAILY_REPORT", createdById: ids["sanu"],
      steps: { create: [
        { seq: 1, label: "Head supervisor check", role: "HEAD_SUP", status: "PENDING" },
        { seq: 2, label: "Site engineer check", role: "SE", assigneeId: ids["sachin"], status: "WAITING" },
      ] },
    },
  });
}

/** Material master + MS entries from the KEM MS log (reference/ms-log.json). Projects not in the app are skipped. */
async function seedMaterials() {
  type Row = { project: string | null; discipline: string; material: string; brand: string | null; msNo: string | null; revision: string | null; status: string; keySpec: string | null; supplier: string | null; remarks: string | null };
  const rows = JSON.parse(readFileSync("reference/ms-log.json", "utf8")) as Row[];
  const projects = Object.fromEntries((await db.project.findMany()).map((p) => [p.code, p.id]));
  let added = 0;
  for (const r of rows) {
    const name = r.material.trim().toUpperCase().replace(/\s+/g, " ");
    const discipline = ["ELE", "PLB", "HVAC", "FLS", "GEN"].includes(r.discipline) ? r.discipline : "GEN";
    const mat = await db.material.upsert({
      where: { name_discipline: { name, discipline } },
      update: {},
      create: { name, discipline, keySpec: r.keySpec },
    });
    const projectId = r.project === "GENERAL" ? null : r.project ? projects[r.project] : undefined;
    if (projectId === undefined || !r.brand) continue;
    const exists = await db.materialSubmittal.findFirst({ where: { materialId: mat.id, projectId, brand: r.brand, msNo: r.msNo } });
    if (exists) continue;
    await db.materialSubmittal.create({
      data: { materialId: mat.id, projectId, brand: r.brand, msNo: r.msNo, revision: r.revision, status: r.status, spec: r.keySpec, supplier: r.supplier, remarks: r.remarks },
    });
    added++;
  }
  if (added) console.log(`MS log: ${added} submittal entries.`);
}

/** Demo BOQ lines and two material requests: NBK with a HIGH-ALERT, Safe Tower clean and at the estimator. */
async function seedDemoMaterials(ids: Record<string, string>) {
  if ((await db.materialRequest.count()) > 0) return;
  const mat = async (name: string) => db.material.findFirst({ where: { name } });
  const nbk = await db.project.findUniqueOrThrow({ where: { code: "NBK" } });
  const safe = await db.project.findUniqueOrThrow({ where: { code: "SAFE" } });
  const boq: [string, string, number, string, number][] = [
    ["NBK", "CHW PIPE INSULATION (NBR)", 600, "m", 38],
    ["NBK", "CHW PIPES (ERW / SEAMLESS STEEL)", 450, "m", 95],
    ["NBK", "AIR TERMINALS (GRILLES & DIFFUSERS)", 140, "nos", 210],
    ["NBK", "DUCT INSULATION (NBR)", 1200, "m²", 55],
    ["NBK", "CONDENSATE DRAIN PIPES & FITTINGS (UPVC)", 300, "m", 18],
    ["SAFE", "ENERGY VALVE", 24, "nos", 2900],
    ["SAFE", "SPRINKLERS (UPRIGHT / PENDENT / CONCEALED)", 900, "nos", 32],
    ["SAFE", "CHW PIPE SUPPORT SYSTEM", 350, "set", 85],
  ];
  for (const [code, name, qty, unit, rate] of boq) {
    const m = await mat(name);
    if (!m) continue;
    const projectId = code === "NBK" ? nbk.id : safe.id;
    await db.boqLine.upsert({
      where: { projectId_materialId: { projectId, materialId: m.id } },
      update: {},
      create: { projectId, materialId: m.id, qty, unit, rateFils: rate * 100 },
    });
  }

  const flow = async (entityId: string, createdById: string, pm: boolean, done: number) => {
    const steps: [string, string, string | null][] = [
      ["SE / PE check", "SE,PE", null], ["Estimator – budget & rates", "EST", null],
      pm ? ["Project Manager", "PM", ids["yadhu.s"]] : ["Operations Manager", "OPS", null],
      ["BUL (above threshold)", "BUL", null], ["Procurement – order / LPO", "PROC", null],
    ];
    await db.approvalFlow.create({
      data: {
        entityType: "MATERIAL_REQUEST", entityId, chainCode: "MR", createdById, currentSeq: done + 1,
        steps: { create: steps.map(([label, role, assigneeId], i) => ({
          seq: i + 1, label, role, assigneeId, status: i < done ? "APPROVED" : i === done ? "PENDING" : "WAITING",
          actedById: i < done ? ids["sachin"] : null, actedAt: i < done ? new Date() : null,
        })) },
      },
    });
  };

  // NBK-MR-001: brand not in an approved MS, and quantity over BOQ (580 already + 80 > 600)
  const ins = await mat("CHW PIPE INSULATION (NBR)");
  const air = await mat("AIR TERMINALS (GRILLES & DIFFUSERS)");
  if (ins && air) {
    await db.materialRequest.create({
      data: {
        ref: "NBK-MR-000", projectId: nbk.id, requesterId: ids["sanu"], status: "ORDERED", lpoNo: "SABR-LPO-2026-0412", totalFils: 580 * 3800,
        lines: { create: [{ materialId: ins.id, brand: "AEROFOAM (HIRA)", qty: 580, unit: "m", rateFils: 3800 }] },
      },
    });
    const r = await db.materialRequest.create({
      data: {
        ref: "NBK-MR-001", projectId: nbk.id, requesterId: ids["sanu"], status: "UNDER_REVIEW", neededBy: null, note: "Level 3 CHW risers",
        lines: { create: [
          { materialId: ins.id, brand: "ARMAFLEX", qty: 80, unit: "m", rateFils: 3800 },
          { materialId: air.id, brand: "TECNALCO", qty: 20, unit: "nos", rateFils: 21000 },
        ] },
      },
      include: { lines: true },
    });
    await db.materialRequest.update({ where: { id: r.id }, data: { totalFils: 80 * 3800 + 20 * 21000 } });
    const insLine = r.lines.find((l) => l.materialId === ins.id)!;
    const airLine = r.lines.find((l) => l.materialId === air.id)!;
    await db.highAlert.createMany({ data: [
      { requestLineId: insLine.id, type: "BRAND_NOT_APPROVED", detail: "CHW PIPE INSULATION (NBR): no approved MS for this project" },
      { requestLineId: insLine.id, type: "QTY_OVER_BOQ", detail: "CHW PIPE INSULATION (NBR): 80 m now + 580 m already requested = 660 m > BOQ 600 m" },
      { requestLineId: airLine.id, type: "BRAND_NOT_APPROVED", detail: "AIR TERMINALS (GRILLES & DIFFUSERS): no approved MS for this project" },
    ] });
    await flow(r.id, ids["sanu"], true, 0);
    for (const u of [ids["sachin"], ids["dinga"]])
      await db.notification.create({ data: { userId: u, type: "HIGH_ALERT", title: "HIGH-ALERT NBK-MR-001: 3 issue(s)", link: `/m/material-requests/${r.id}`, entityType: "MATERIAL_REQUEST", entityId: r.id } });
  }
  // SAFE-MR-001: approved brands, within BOQ – checked by SE, now with the estimator
  const valve = await mat("ENERGY VALVE");
  const spr = await mat("SPRINKLERS (UPRIGHT / PENDENT / CONCEALED)");
  if (valve && spr) {
    const r = await db.materialRequest.create({
      data: {
        ref: "SAFE-MR-001", projectId: safe.id, requesterId: ids["vishnu"], status: "UNDER_REVIEW",
        lines: { create: [
          { materialId: valve.id, brand: "BELIMO", spec: "Energy valve", qty: 6, unit: "nos" },
          { materialId: spr.id, brand: "BRISTOL", spec: "Sprinkler heads", qty: 120, unit: "nos" },
        ] },
      },
    });
    await flow(r.id, ids["vishnu"], true, 1);
    await db.notification.create({ data: { userId: ids["deepak"], type: "APPROVAL", title: "Material request SAFE-MR-001 – waiting for you", link: `/m/material-requests/${r.id}`, entityType: "MATERIAL_REQUEST", entityId: r.id } });
  }
}

/** Demo: 3 NBK drawings (PDF generated); two released for construction. */
async function seedDemoDrawings(ids: Record<string, string>) {
  if ((await db.drawing.count()) > 0) return;
  const nbk = await db.project.findUniqueOrThrow({ where: { code: "NBK" } });
  const root = path.resolve(process.env.UPLOAD_DIR || "data/uploads");
  const dir = path.join(root, "NBK", "drawings", new Date().toISOString().slice(0, 7));
  mkdirSync(dir, { recursive: true });
  const list: [string, string, string, string, boolean][] = [
    ["005", "HVAC", "Level 2 ductwork layout", "R1", true],
    ["006", "HVAC", "Level 2 CHW piping layout", "R0", true],
    ["011", "ELE", "Level 2 cable tray & lighting layout", "R0", false],
  ];
  for (const [number, discipline, title, rev, fc] of list) {
    const ref = `NBK-SHD-${discipline}-${number}`;
    const buf = await drawingPdf({
      ref, title, rev, project: "NBK", scale: 50, ducts: discipline === "HVAC",
      dims: [{ x: 50, y: 80, mm: 1000 }, { x: 50, y: 70, mm: 6000 }, { x: 330, y: 80, mm: 4500, vertical: true }],
    });
    const file = await db.fileObject.create({
      data: { path: "", mime: "application/pdf", size: buf.length, sha256: createHash("sha256").update(buf).digest("hex"), kind: "PDF", module: "drawings", projectId: nbk.id, uploadedById: ids["alwin"], originalName: `${ref}.pdf` },
    });
    const abs = path.join(dir, `${file.id}.pdf`);
    writeFileSync(abs, buf);
    await db.fileObject.update({ where: { id: file.id }, data: { path: path.relative(root, abs) } });
    const d = await db.drawing.create({ data: { ref, number, projectId: nbk.id, title, discipline, docType: "SHD", createdById: ids["alwin"] } });
    await db.drawingRevision.create({
      data: {
        drawingId: d.id, rev, fileId: file.id, uploadedById: ids["alwin"], status: fc ? "APPROVED" : "UNDER_REVIEW", forConstruction: fc,
        releasedById: fc ? ids["alwin"] : null, releasedAt: fc ? new Date() : null,
      },
    });
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
