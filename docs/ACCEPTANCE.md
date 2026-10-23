# Pilot acceptance tests (brief section 11)

Automated tests run with `npm test` (Vitest, 153 tests) and `npm run build && npm run test:e2e` (Playwright, phone 390 px + desktop 1440 px).

| # | Acceptance test | Automated in | Result | Still check by hand |
|---|---|---|---|---|
| 1 | Sanu marks 9 workers (1 late 08:20, 1 SL) with no internet; syncs when online | `tests/e2e/attendance.spec.ts` › acceptance 1 | ✓ pass | On a real phone in airplane mode |
| 2 | Emergency move of 3 workers NBK → Safe Tower at 10:15; Renjith approves; hours split | `tests/e2e/moves.spec.ts`, `tests/unit/moves-logistics.test.ts` | ✓ pass (2 h / 6 h) | – |
| 3 | Timesheet 26-Sep → 25-Oct follows 7.2; tests use real workbook rows | `tests/unit/timesheet-rules.test.ts` (37 real Daily Log rows + 5 workers' totals), `attendance-timesheet.test.ts` (export layout) | ✓ pass | Open the export in Excel next to the reference workbook |
| 4 | Non-MS brand → HIGH-ALERT to Sachin and Dinga, not Sanu | `tests/e2e/materials.spec.ts`, `tests/unit/materials.test.ts` | ✓ pass | – |
| 5 | NBK (PM Yadhu S) routes to him; Mangrove to Ops Yadhu V; > AED 100,000 adds Nobin | `tests/unit/materials.test.ts`, `tests/e2e/materials.spec.ts` | ✓ pass | – |
| 6 | Supervisor and driver API responses contain no AED fields | `tests/unit/money.test.ts`, `tests/e2e/access.spec.ts`, `logistics.spec.ts`, `materials.spec.ts`, `dashboards.spec.ts` | ✓ pass | – |
| 7 | Vehicle 3 double-booked → red clash banner for Renjith | `tests/e2e/logistics.spec.ts`, `tests/unit/clash.test.ts` | ✓ pass | – |
| 8 | Ali: vehicle check, trip with delivery photo, fuel bill | `tests/e2e/logistics.spec.ts`, `tests/unit/moves-logistics.test.ts` | ✓ pass | Real camera on Ali's phone |
| 9 | Dinga signs out all Sanu's devices; Sanu logged out on next request | `tests/e2e/admin.spec.ts`, `tests/unit/session.test.ts` | ✓ pass | – |
| 10 | Calibrate on 1,000 mm, measure another line within ±1% | `tests/e2e/drawings.spec.ts`, `tests/unit/drawings.test.ts` | ✓ pass (3,500 mm read as 3,500 mm) | On a phone with finger taps (zoom in first) |
| 11 | Every screen usable at 390 px and 1440 px; PWA installable | all e2e specs run in both viewports with a no-sideways-scroll check; `tests/e2e/hardening.spec.ts` (Chrome installability check, axe WCAG A/AA on 11 key screens) | ✓ pass | "Add to Home screen" on Android and iPhone |

Note on 11: Lighthouse removed its PWA audit in version 12 (2024); the test uses Chrome's own installability check (`Page.getInstallabilityErrors`), which is what decides whether "Install app" is offered.

## Not testable in the build environment

| Item | Why | How to check on the ZBook |
|---|---|---|
| Windows service and nightly backup task | Built on Linux; no Windows / PowerShell there | Run `install-service.ps1`, reboot, open http://localhost:3000/api/health; next morning check `BACKUP_DIR\backup.log` |
| Tailscale Funnel | Needs your Tailscale account | `TAILSCALE_FUNNEL.md` |
| Voice notes | Need a real microphone | Record one in Move workers and play it back in the office |
| Malayalam / Hindi wording | Draft translations | Read through with Renjith and a supervisor; correct `messages/ml.json`, `messages/hi.json` |
