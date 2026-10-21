# KEM Site Coordination Platform (pilot)

Internal web app for Kahraba Electromechanical Services LLC (KEM). One codebase: phone PWA for site roles, desktop for office roles.

Plan, schema and milestones: [`docs/PILOT_PLAN.md`](docs/PILOT_PLAN.md).

## Run on the ZBook (Windows)

| Step | Command |
|---|---|
| 1. Install Node.js 22 LTS | from nodejs.org |
| 2. Get the code | `git clone https://github.com/bvgautham7maakan/dingan.git C:\KEM-App` then `cd C:\KEM-App` |
| 3. Settings | `copy .env.example .env` (edit `SEED_TEMP_PASSWORD`) |
| 4. Install | `npm install` |
| 5. Database | `npx prisma migrate deploy` then `npm run seed` |
| 6. Start (dev) | `npm run dev` → http://localhost:3000 |
| 6. Start (prod) | `npm run build` then `npm start` |

Windows service, nightly backup and Tailscale Funnel guide arrive in M8.

## Scripts

| Script | Does |
|---|---|
| `npm run seed` | Adds users, sites, projects, vehicles, workers, holidays (safe to re-run) |
| `npm run reset-demo` | Deletes the demo DB and rebuilds it (asks you to type RESET) |
| `npm test` | Unit tests (Vitest) |
| `npm run test:e2e` | Browser tests at 390 px and 1440 px (run `npm run build` first) |
| `npm run lint` / `npm run typecheck` | Code checks |

## Seeded users

Every user starts with the temporary password from `SEED_TEMP_PASSWORD` and must change it at first sign-in.

| Username | Name | Role |
|---|---|---|
| dinga | Dinga (Gautham B V) | Admin + Project Engineer |
| nobin | Nobin | BUL |
| yadhu.v | Yadhu V | Operations Manager |
| yadhu.s | Yadhu S | Project Manager (NBK, Safe Tower) |
| sachin | Sachin | Site Engineer |
| deepak | Deepak | Estimator |
| alwin | Alwin | Design |
| aswin | Aswin | Coordinator |
| azhar | Azhar | Procurement |
| renjith | Renjith | Head supervisor |
| vishnu, aneesh, sanu | Supervisors | Site supervisor |
| jitendar | Jitendar | HVAC supervisor |
| ali | Ali | Driver (Vehicle 1) |

## Reference data

`reference/` holds notes and test fixtures taken from the KEM workbooks (worker names, timesheet rules, sample Daily Log rows). No salary or rate data.

## Data and privacy

- All data stays on the ZBook (`data/`). No third-party services. Next.js telemetry is switched off.
- `.env` and `data/` are never committed.
