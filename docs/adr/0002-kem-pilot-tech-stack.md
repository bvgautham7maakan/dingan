# 0002 – KEM pilot tech stack

- **Status:** Accepted
- **Date:** 2026-10-24 (records the stack used for pilot milestones M1–M8)
- **Deciders:** Gautham
- **Source:** `docs/PILOT_PLAN.md` §1 on branch `claude/funny-brown-r49ety`

## Context

The KEM Site Coordination Platform pilot must:

- run on phones (390 px) and desktops (1440 px) from one codebase
- work offline on site (attendance, drawings) and sync later
- handle money without rounding errors and hide AED from site roles
- run on one Windows office PC, reachable over Tailscale
- move to PostgreSQL later without a rewrite

## Decision

| Layer | Choice | Why |
|---|---|---|
| App | Next.js 15 (App Router) + TypeScript | One responsive codebase for UI and API |
| UI | CSS modules + CSS variables (KEM palette), no UI kit | Full control of 60 px touch targets and Arial |
| PWA | Web manifest + hand-written service worker | Installable; offline shell and drawings |
| Offline data | IndexedDB (Dexie) outbox → `/api/sync`, client UUID per mutation | Idempotent sync, no duplicates |
| Database | Prisma + SQLite; enum-like fields stored as `String`, validated by zod | Zero-admin for the pilot; schema moves to PostgreSQL unchanged |
| Money | Integer fils (AED × 100) | No float rounding |
| Auth | argon2id, opaque session token in cookie (90-day sliding), `Session` table | Per-device revoke |
| Validation | zod on every API input | One schema per endpoint |
| Files | `data/uploads/<project>/<module>/<yyyy-mm>/`, optional OneDrive mirror | Simple, backed up nightly |
| PDF / Excel | pdf.js, exceljs | Drawing viewer and timesheet export |
| i18n | next-intl (en, ml, hi) | Site crew languages |
| Tests | Vitest (logic), Playwright (390 px + 1440 px) | Covers the acceptance tests |
| Hosting | Windows service via NSSM + `start-kem.cmd`; Tailscale for remote access | Runs on existing office hardware |

## Options rejected

| Option | Reason |
|---|---|
| Separate mobile app (React Native / Flutter) | Two codebases; a PWA covers offline needs |
| PostgreSQL from day one | Extra service to run on a Windows PC during the pilot |
| UI kit (MUI, shadcn) | Harder to enforce large touch targets and the KEM look |
| Cloud hosting | Data stays on KEM hardware for the pilot; Tailscale gives remote access |

## Consequences

| Type | Effect |
|---|---|
| Good | One codebase, offline-capable, low running cost, PostgreSQL path kept open |
| Cost | SQLite is single-writer: fine for the pilot, a limit at larger scale |
| Cost | The office PC is a single point of failure; mitigated by nightly backups |
| Follow-up | New ADR when moving to PostgreSQL or changing hosting |
