/* KEM pilot seed: users, roles, sites, projects, vehicles, subcontractors, workers, holidays, settings.
 * Idempotent: safe to run again (upserts by natural key). Demo transactions arrive with later milestones.
 */
import { PrismaClient } from "@prisma/client";
import { hash } from "@node-rs/argon2";

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
  ["2026-08-25", "Prophet's Birthday (est.)"],
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

  // Workers E01–E34. Real names load from the timesheet Employees sheet once the file is in reference/.
  for (let n = 1; n <= 34; n++) {
    const empCode = `E${String(n).padStart(2, "0")}`;
    const status = n === 13 ? "LEFT" : n >= 32 ? "PLACEHOLDER" : "ACTIVE";
    const name = n === 13 ? "Nigesh" : `Worker ${empCode}`;
    await db.worker.upsert({ where: { empCode }, update: {}, create: { empCode, name, status } });
  }

  for (const [date, name] of HOLIDAYS)
    await db.publicHoliday.upsert({ where: { date }, update: {}, create: { date, name } });

  const settings: [string, unknown][] = [
    ["bulThresholdFils", 100_000 * 100],
    ["cycleStartDay", 26],
    ["dayShiftStart", "08:00"],
    ["nightShiftStart", "23:00"],
    ["eveningShiftStart", "20:00"],
  ];
  for (const [key, value] of settings)
    await db.setting.upsert({ where: { key }, update: {}, create: { key, value: value as never } });

  console.log(`Seeded ${USERS.length} users (temporary password: ${TEMP}), ${SITES.length} sites, ${PROJECTS.length} projects, 34 workers.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
