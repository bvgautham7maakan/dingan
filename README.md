# KEM Site Coordination Platform (pilot)

Internal web app for Kahraba Electromechanical Services LLC (KEM). One codebase: phone PWA for site roles, desktop for office roles.

Plan, schema and milestones: [`docs/PILOT_PLAN.md`](docs/PILOT_PLAN.md).

## Run on the ZBook (Windows)

Full steps: [`docs/DEPLOY_WINDOWS.md`](docs/DEPLOY_WINDOWS.md). In short:

| Step | Command |
|---|---|
| 1. Install Node.js 22 LTS + Git | nodejs.org · git-scm.com |
| 2. Get the code | `git clone https://github.com/bvgautham7maakan/dingan.git C:\KEM-App` |
| 3. Set up (run twice: first creates `.env`) | `powershell -ExecutionPolicy Bypass -File scripts\windows\setup.ps1` |
| 4. Service + nightly backup (Administrator) | `powershell -ExecutionPolicy Bypass -File scripts\windows\install-service.ps1` |
| 5. Remote access | [`docs/TAILSCALE_FUNNEL.md`](docs/TAILSCALE_FUNNEL.md) |

## Guides

| Who | File |
|---|---|
| Office team (English) | [`docs/guides/KEM-Site-Office-Guide.pdf`](docs/guides/KEM-Site-Office-Guide.pdf) |
| Site team – one page with pictures | [`docs/guides/KEM-Site-Phone-Guide.pdf`](docs/guides/KEM-Site-Phone-Guide.pdf) |
| Acceptance tests status | [`docs/ACCEPTANCE.md`](docs/ACCEPTANCE.md) |

## Scripts

| Script | Does |
|---|---|
| `npm run dev` | Development server (http://localhost:3000) |
| `npm run build` / `npm start` | Production build / server (127.0.0.1:3000) |
| `npm run seed` | Users, sites, projects, workers, materials, holidays (+ demo data unless `SEED_DEMO=false`) |
| `npm run reset-demo` | Deletes the database and rebuilds it (asks you to type RESET) |
| `npm run backup` | Database + uploads to `BACKUP_DIR` (nightly via the scheduled task) |
| `npm test` | Unit tests (Vitest) |
| `npm run test:e2e` | Browser tests at 390 px and 1440 px (run `npm run build` first) |
| `npm run lint` / `npm run typecheck` | Code checks |
| `node scripts/guide-screens.mjs` + `node scripts/guide-pdf.mjs` | Re-capture guide screenshots and rebuild the PDF guides |

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
