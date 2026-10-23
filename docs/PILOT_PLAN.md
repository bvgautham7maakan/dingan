# KEM Site Coordination Platform — Pilot Plan (pre-build)

Status: **M8 built – pilot complete**, awaiting sign-off.

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

## 7. Decisions taken during M3

| Item | Decision | Why |
|---|---|---|
| Approval engine | One generic engine (`src/lib/approvals.ts`) for every chain; moves and vehicle plan use it now, daily report / MR next | Same step bar, return-with-comment and notifications everywhere |
| Return | Needs a comment; goes to the previous step, or back to the requester from step 1 | Brief section 6 |
| Emergency move | Applies at once; if Renjith returns it, the hour split is undone | Brief 7.3 |
| Normal move | Hours move only after Renjith approves (split still at the move time) | Brief section 6 |
| Head supervisor's own moves | Apply at once, no approval step | He is the approver |
| Hour split | In proportion to time at each site (incl. lunch), e.g. move at 12:00 on 08:00–17:00 → 3.56 h / 4.44 h | Lunch time is not known per site |
| Vehicle booking with a move | Creates a trip on that day's vehicle plan (1 h slot, default driver) | Brief 7.3 "optional vehicle booking" |
| Vehicle plan | Supervisors add trips and send to Renjith; any later edit by them sends it back to draft; PM view only | Brief section 6 |
| Clash | Same vehicle or same driver with overlapping times → red banner + row marked "Clash". Approval is not blocked | Renjith decides; tell me if approval should be blocked |
| Trip start | Blocked until that vehicle has a check today; "Delivered" needs a photo | Brief 7.4 |
| Bills | Driver must enter an amount; supervisor form has none; office adds/corrects the amount and marks "Checked" | Brief 7.4 |
| Uploads | Real file type checked from the bytes (JPEG/PNG/WebP, voice WebM/OGG/M4A/WAV), max 15 MB, photos shrunk on the phone to ≤1600 px | Security + storage |
| OneDrive mirror | Off by default (`ONEDRIVE_MIRROR=true` to enable); writes only into the project's OneDrive path + "KEM App uploads" | "Never write into OneDrive except approved paths" |
| Map link | Site's Google Maps link if set, else its GPS, else a search for "<site>, Abu Dhabi" | Site GPS not yet entered |

## 8. Decisions taken during M4

| Item | Decision | Why |
|---|---|---|
| Daily report steps | 1 Manpower (pre-filled from attendance + moves, subcontractor counts) · 2 Work done (text, photos, voice) · 3 Issues & materials needed · 4 Tomorrow's plan + check & send | Mockup page 21 says "4 steps" but the step names are images; change if the mockup differs |
| Report chain | Supervisor → Head supervisor check → Site engineer check (the project's SE if exactly one is assigned, else any SE) | Brief section 6 |
| Report returned | Goes back one step; from Renjith it goes back to the supervisor, who edits and sends again (one report per supervisor per project per day) | Brief section 6 |
| Draft | The report is kept on the phone while being written, so a call or lost signal does not lose it | Field use |
| Duties | Renjith (or Admin) assigns; supervisor marks done with a photo (required); SE and PE of the project plus Renjith are notified; list grouped overdue → today → this week | Brief 6 + 7.7 |
| Safety checklist | 12 items OK / Issue / N/A; "Mark all remaining OK"; an Issue needs a note and a photo and alerts Renjith + SE; Renjith/SE/PE see 7-day overview and which sites have not checked today | Brief scope item 7 |
| Site queries | Ref `<PROJECT>-SQ-001`; discipline, drawing ref (free text until M6), photos, voice note; Design answers; requester notified; requester / SE / PE close | Brief section 6 |
| Two-button forms | Approve and Return are separate server actions (a clicked button's value is not sent) | Bug found by the browser tests |

## 9. Decisions taken during M5

| Item | Decision | Why |
|---|---|---|
| Material master | Seeded from "MATERIAL SUBMITTAL LOG - ALL PROJECTS.xlsx" (191 rows → 115 materials, 143 MS entries); notes in `reference/ms-log-notes.md` | Brief section 1 |
| Project mapping | "Al Saif Tower (Sanad)" → SAFE, "NBK Khalifa Park" → NBK, "Mangrove Villa 5105" → MANG; Lets Cafe and Jereh Office are not app projects (materials kept, MS entries skipped) | To confirm |
| NBK MS status | The log has **no approved** NBK entries (22 under review, 11 draft), so every NBK request raises HIGH-ALERT until statuses are updated in Materials & MS brands | Real data |
| Chain | SE or PE → Estimator (rates; total) → PM if the project has one, else Ops → BUL only if total > threshold (else shown "skipped") → Procurement (LPO no. = ordered) | Brief section 6 |
| Threshold | Project's own BUL threshold if set, else company setting AED 100,000; "above" means strictly greater | Brief 6 |
| Own requests | Nobody approves a step on an item they raised (applies to every chain) | Good practice |
| Returned to requester | Requester raises a new request or closes the returned one | Keeps the audit trail simple |
| Brand auto-fill | First approved brand pre-selected; other approved brands as chips; "Other brand" free text → HIGH-ALERT | Brief 7.5 |
| HIGH-ALERT | Brand/spec not in an approved MS for the project; requested + already requested (open + ordered) > BOQ. Shown only to SE/PE (pinned on dashboard and request page; notification); SE/PE can mark an alert checked with a note | Brief 7.5 |
| Rates | Estimator enters rates; pre-filled from BOQ rate where set; hidden from no-AED roles on every screen and API | Brief 5 |
| Units | Supervisor picks unit chips (nos, m, m², set, roll, length, kg, ltr, box); MS log has no units | Minimal typing |
| BOQ | Per project; edit inline or import Excel (header row with Material, Qty, optional Discipline, Unit, Rate); unknown materials are added | Brief 7.5 |

## 10. Decisions taken during M6

| Item | Decision | Why |
|---|---|---|
| Drawing ref | `<PROJECT>-<TYPE>-<DISCIPLINE>-<NNN>`, number auto-increments per project/type/discipline; types SHD, DD, ASB, SK | Brief 7.6 |
| Upload | Design, Coordinator, PE, Admin; PDF only (checked from the file bytes), max 60 MB; via `/api/drawings` (server actions have a 1 MB body limit) | Drawings are large |
| For construction | Only Design releases; releasing a revision supersedes the previous FC revision; site roles (SUP, HVAC_SUP, HEAD_SUP) see and can download only FC revisions (enforced on the file endpoint too) | Brief section 6 |
| Viewer | pdf.js 4.10; big − / + / Fit buttons, page arrows, scroll to pan (no pinch needed) | Brief 7.6 |
| Calibration | Per page: tap both ends of a known dimension, enter mm; scale shown as "≈ 1:50" (A-size sheets) | Brief 7.6 |
| Measuring | Point-to-point and chain; points stored in PDF page units so results do not depend on zoom; saved with the drawing (offline-capable) | Brief 7.6 |
| Accuracy | Test: calibrate on 1,000 mm, measure 3,500 mm → 3,500 mm (limit ±1%) | Acceptance 10 |
| Snap to lines | Not in the pilot – tap accuracy depends on zoom; zoom in before tapping | Phase 2 with DWG |
| Offline drawings | "Save offline" stores the PDF and viewer page in a separate phone cache that survives app updates; the drawing opens with no signal | Brief 7.6 |
| Site query link | A query's drawing ref links to the released revision when it exists in the register | Convenience |

## 11. Decisions taken during M7

| Item | Decision | Why |
|---|---|---|
| Dashboard frame | Every role: HIGH-ALERT (SE/PE only) → Waiting for you (Overdue / Today / This week / Later) → Since your last visit → Today's cards → Coming later; desktop right panel My / All projects | Brief 7.7 |
| Due times | Approvals: 24 h after reaching the step; site queries: 48 h; drawings to release: 5 days; supervisors: attendance by 10:00, safety by 12:00, daily report by 18:00; duty: its deadline; driver: vehicle check by 07:00 | Pilot defaults – tell me if you want others |
| Role cards | From MOCKUP V4 captions (pages 4–17), live data from M1–M6; modules outside the pilot shown as "Coming in phase 2/3" per role | Brief 2 + 7.7 |
| Since last visit | A visit = dashboard opened more than 30 min after the previous view; shows notifications, requests, moves, reports, queries, drawing releases since then | Brief 7.7 |
| Notifications | In-app only: bell with unread count on every screen, list page, opening one marks it read; "mark all read" | Brief scope 12 (no third-party push) |
| Project page | Man-days used vs budget (moved workers by share of the day), today, moves, reports, open requests, FC drawings | Brief 7.3 / MOCKUP p27 |
| Man-day budget | Entered in Admin › Projects; demo: NBK 2,400, Safe Tower 1,800, Mangrove 900 | Brief 7.3 |

## 12. Decisions taken during M8

| Item | Decision | Why |
|---|---|---|
| Windows service | Task Scheduler (built in): start at boot, restart loop + task restart on failure, runs as the user with S4U (no stored password) | No third-party download (NSSM not needed) |
| Server binding | `next start -H 127.0.0.1`; outside access only through Tailscale | Port 3000 never exposed on the LAN/internet |
| Backup | `VACUUM INTO` copy while running + incremental uploads; 14 daily + 12 monthly; verified by opening the copy | Brief section 9 |
| Login limit behind a proxy | Per-username limit always; per-address limit only when the client address is known | Prevents one attacker locking everyone out through Funnel |
| CSP | Same-origin only; `'unsafe-inline'` for scripts (Next.js hydration) and styles | No third parties; nonces add complexity for little gain here |
| Go-live | `SEED_DEMO=false` + `npm run reset-demo` gives master data only | Clean start after the demo |
| PWA check | Chrome installability API instead of Lighthouse (PWA audit removed in Lighthouse 12) | Acceptance 11 |
| Accessibility | axe WCAG 2 A/AA, no serious/critical issues on 11 key screens; scrollable tables keyboard-focusable | Brief section 9 |
