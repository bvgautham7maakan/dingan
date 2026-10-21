# KEM Site Coordination Platform — Pilot Plan (pre-build)

Status: **M2 built** – awaiting sign-off before M3.

## 1. Stack (confirmed, with notes)

| Layer | Choice | Note |
|---|---|---|
| App | Next.js 15 (App Router) + TypeScript | One codebase, responsive |
| UI | Plain CSS modules + CSS variables (KEM palette) | No UI kit; keeps 60 px targets and Arial under control |
| PWA | Web manifest + hand-written service worker (`public/sw.js`) | Offline shell now; IndexedDB outbox in M2, FC drawings in M6 |
| Offline data | IndexedDB (Dexie) outbox → `/api/sync` | Each mutation carries a client UUID; server is idempotent |
| DB | Prisma + SQLite | No Prisma enums (stored as `String`, validated by zod) so the schema moves to PostgreSQL unchanged |
| Money | Integer **fils** (AED × 100) | No float rounding; portable |
| Auth | argon2id, opaque session token (cookie, 90 d sliding), `Session` table | Revoke = delete/flag row; checked on every request |
| Validation | zod on every API input | |
| Files | `data/uploads/<project>/<module>/<yyyy-mm>/` + optional mirror copy to project OneDrive path | Magic-byte type check, size limit |
| PDF | pdf.js (pdfjs-dist) | |
| Excel | exceljs | |
| i18n | next-intl, `messages/en.json`, `ml.json`, `hi.json` | |
| Tests | Vitest (logic), Playwright (390 px + 1440 px) | |
| Host | Windows service via NSSM + `start-kem.cmd`; Tailscale Funnel guide only | |

## 2. Database schema

Conventions: `id` = cuid string · timestamps UTC, displayed Asia/Dubai · `*Fils` = money (stripped for no-AED roles) · enum-like fields are strings.

### 2.1 Core / auth

| Table | Key fields | Relations |
|---|---|---|
| User | username (unique), displayName, passwordHash, mustChangePassword, active, locale (en/ml/hi), lastSeenAt, prevSeenAt | 1–n UserRole, Session |
| UserRole | userId, role (ADMIN, PE, BUL, OPS, PM, SE, EST, DESIGN, COORD, PROC, HEAD_SUP, SUP, HVAC_SUP, DRIVER) | multi-role (Dinga = ADMIN + PE) |
| Session | tokenHash, userId, deviceLabel, userAgent, ip, createdAt, lastUsedAt, expiresAt, revokedAt, revokedById | |
| LoginAttempt | username, ip, at, success | rate limit |
| AuditLog | actorId, action (CREATE/EDIT/APPROVE/RETURN/REJECT/REVOKE…), entityType, entityId, before JSON, after JSON, at | every write |
| Setting | key, value JSON | BUL threshold (100,000 AED), cycle start day (26), etc. |

### 2.2 Master data

| Table | Key fields | Relations |
|---|---|---|
| Site | code, name, kind (PROJECT/OFFICE/STORE), lat, lng, mapUrl, defaultStartTime | |
| Project | code (NBK…), name, siteId, client, status, oneDrivePath, pmUserId (nullable), manDayBudget, bulThresholdFils (nullable override) | n ProjectMember |
| ProjectMember | projectId, userId, role | drives "My projects" |
| Worker | empCode (E01…), name, trade, designation, status (ACTIVE/LEFT/PLACEHOLDER), joinDate | not a user |
| Vehicle | name, plate, defaultDriverId | |
| Subcontractor | name, disciplines | phase 2 use |
| PublicHoliday | date, name | editable |

### 2.3 Generic approval engine (reused by every module, incl. phase 2 CCR/IPA)

| Table | Key fields |
|---|---|
| ApprovalFlow | entityType, entityId, chainCode, status (IN_PROGRESS/APPROVED/REJECTED/CLOSED), currentSeq |
| ApprovalStep | flowId, seq, label, role, assigneeId (nullable = anyone with role on project), status (WAITING/PENDING/APPROVED/RETURNED/SKIPPED), actedById, actedAt, comment |

Chains are built from rules at submit time (e.g. PM vs OPS, BUL if > threshold) and re-evaluated if value changes.

### 2.4 Attendance + timesheet

| Table | Key fields |
|---|---|
| DayPlan | date, createdById, status, approvedById |
| DayPlanLine | planId, workerId, siteId, vehicleId, shift |
| Attendance | date, workerId, siteId, status (IN/LATE/OUT), leaveCode (AL/SL/CL/A/OFF), shift (DAY/NIGHT/EVE/OTHER), shiftStart, inAt, outAt, markedById, clientId (offline UUID, unique) |
| WorkSegment | attendanceId, siteId, projectId, startAt, endAt, source (ATTENDANCE/MOVE) — hours split per site |
| TimesheetExport | cycleStart, cycleEnd, fileId, createdById |

Timesheet hours are **computed**, not stored (pure function, unit-tested), so rule fixes reapply to history.

### 2.5 Manpower moves

| Table | Key fields |
|---|---|
| ManpowerMove | fromSiteId, toSiteId, moveAt, reason (EMERGENCY/EXTRA/MATERIAL/OTHER), note, voiceFileId, appliedAt, tripId, approvalFlowId |
| ManpowerMoveWorker | moveId, workerId |

### 2.6 Logistics

| Table | Key fields |
|---|---|
| VehiclePlan | date, status, approvalFlowId |
| Trip | planId, date, vehicleId, driverId, fromSiteId, toSiteId, plannedOut, plannedReturn, startedAt, deliveredAt, returnedAt, purpose, materialsText, deliveryPhotoId, status |
| TripPassenger | tripId, workerId |
| VehicleCheck | vehicleId, driverId, date, tyresOk, oilOk, lightsOk, damageNote, photoId |
| DriverBill | type (FUEL/SALIK/FINE), vehicleId, driverId, date, amountFils, odometer, photoId (required), voiceFileId |

Clash = query (same vehicle or driver, overlapping planned windows), not stored.

### 2.7 Duties, reports, queries

| Table | Key fields |
|---|---|
| Duty | projectId, title, detail, assignedById, assigneeId, deadline, status, doneAt, donePhotoId |
| DailyReport | projectId, date, authorId, manpower JSON, workDone, issues, nextDay, approvalFlowId |
| SafetyChecklist | projectId, date, byId, items JSON, photoId |
| SiteQuery | ref, projectId, raisedById, subject, question, drawingRevisionId, status, answer, answeredById, answeredAt |
| Attachment | entityType, entityId, fileId (photos/voice for any record) |

### 2.8 Materials

| Table | Key fields |
|---|---|
| Material | name, discipline, unit, keySpec |
| MaterialSubmittal | materialId, projectId (null = all projects), brand, msNo, revision, status, spec |
| BoqLine | projectId, materialId, description, qty, unit, rateFils |
| MaterialRequest | ref, projectId, requesterId, neededBy, status, totalFils, lpoNo, orderedAt, approvalFlowId |
| MaterialRequestLine | requestId, materialId, submittalId, brand, spec, qty, unit, rateFils |
| HighAlert | requestLineId, type (BRAND_NOT_APPROVED/QTY_OVER_BOQ), detail, resolvedById, resolvedAt |

### 2.9 Documents

| Table | Key fields |
|---|---|
| Drawing | ref (NBK-SHD-HVAC-005), projectId, number, title, discipline, docType |
| DrawingRevision | drawingId, rev, status, forConstruction, fileId, releasedById, releasedAt |
| DrawingCalibration | revisionId, page, pxLength, realMm, byId |
| DrawingMeasurement | revisionId, page, points JSON, lengthMm, label, byId |

### 2.10 Files, notifications, sync

| Table | Key fields |
|---|---|
| FileObject | path, mime, size, sha256, kind, projectId, module, uploadedById, mirroredAt |
| Notification | userId, type, title, body, link, entityType, entityId, readAt |
| SyncReceipt | clientMutationId (unique), userId, receivedAt — offline idempotency |

### 2.11 Phase 2/3 readiness

| Need | How it fits |
|---|---|
| CCR / VO / IPA / sub bills | new tables + `ApprovalFlow` chain codes; money in fils |
| Estimation / price lists | link to Material, BoqLine |
| DWG viewer, take-off | new FileObject kinds + DrawingRevision |
| PostgreSQL | change Prisma provider, run migrate |

## 3. Money stripping

Single server serializer: for roles SUP, HEAD_SUP, HVAC_SUP, DRIVER, DESIGN every key ending `Fils` (and derived `aed*`) is removed before the response leaves the API. Covered by an API test per role (acceptance test 6).

## 4. M1 task list

| # | Task |
|---|---|
| 1 | Scaffold Next.js + TS, ESLint, Prettier, Vitest, Playwright |
| 2 | Prisma schema (full, all modules) + first migration |
| 3 | Auth: login, argon2, session cookie 90 d sliding, rate limit, forced password change |
| 4 | Session admin: list devices, sign out all devices (ADMIN/PM), deactivate user (ADMIN) |
| 5 | Role/permission middleware + money-strip serializer + audit log helper |
| 6 | App shell: desktop left menu (≤ 7 groups, Log out bottom), mobile 5 bottom tabs, KEM header/logo |
| 7 | Branding tokens, status colour components (text + icon, not colour only), 60/64 px touch targets |
| 8 | i18n scaffold EN/ML/HI + toggle on every screen |
| 9 | Admin: users, projects, sites, workers, vehicles, holidays |
| 10 | Seed: users, sites, projects, vehicles, subcontractors, 33 workers |
| 11 | PWA manifest + service worker shell |
| 12 | Tests: auth, revoke, money strip; Playwright login at 390/1440 px |
| 13 | Commit "M1" + click-through notes |

## 5. Decisions taken during M1

| Item | Decision | Why |
|---|---|---|
| Service worker | Hand-written `public/sw.js` instead of Serwist | Fewer moving parts; same result for an app shell |
| Text on cyan | Black, not white | White on `#00B4F0` is 2.5:1 contrast (fails WCAG, unreadable in sunlight). Black is 8.7:1 |
| Temporary passwords | Shown once via a 2-minute cookie, never in the URL | Keeps them out of browser history |
| DB reset | `npm run reset-demo` deletes the SQLite file and rebuilds | Prisma blocks `migrate reset` from automated agents |
| Workers | E01–E34 seeded as "Worker Exx" (E13 Nigesh = Left, E32–E34 placeholders) | Real names load once the timesheet workbook is in `reference/` |
| Holidays | UAE 2026–27 seeded; Islamic dates marked "(est.)" | Editable in Admin › Public holidays |

## 6. Decisions taken during M2

| Item | Decision | Why |
|---|---|---|
| Timesheet rules | Exact port of the reference workbook formulas (`src/lib/timesheet/rules.ts`) | Tested against 37 real Daily Log rows + 5 workers' cycle totals |
| Night shift | No special rule: 23:00–07:00 is an 8-h span, so 8 normal, no OT (same as workbook) | Workbook gets the brief's result this way |
| 20:00–08:00 shift | 8 normal + 3 h OT ×1.25 (same as workbook, e.g. Zahoor) | Brief silent; workbook is the reference |
| 8–9 h span on Mon–Sat | Full 8 normal hours (workbook behaviour) | Matches workbook |
| No finish time entered | Standard 9-h shift assumed; marked `*` on screen and in Remarks | Timesheet must still compute |
| Day with no record | Sunday/PH → OFF; normal day → blank (not entered); after last day → LEFT | Matches workbook codes |
| Leave codes | App OUT reasons AL, SL, CL, A, OFF; LV and LEFT exist only in the export | Brief list; workbook extras kept for format |
| Moves | Hours split by time at each site; extra "Site hours" sheet in the export | Needed for M3 and man-days |
| Excel header text | Black on cyan (same contrast rule as the screens) | Readability |
| Salaries | Not stored; money columns in the export keep their headers, blank | Confidential, and out of pilot scope |
| Mockup V4 | Screens are images – only captions extracted (`reference/mockup-v4-notes.md`) | Needs the PDF in the repo to check layouts |
