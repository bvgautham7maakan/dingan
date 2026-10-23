# MS log extraction notes

Source: Google Drive `MATERIAL SUBMITTAL LOG - ALL PROJECTS.xlsx` (file id `1kP2LzXVhrqBu9NTKQ2SRBg3YPG9a30WU`, 55,786 bytes), downloaded as the real .xlsx and read with openpyxl. The workbook calls itself the "KEM reference library (compiled 22-09-2026)".
Output: `reference/ms-log.json`, with 191 rows from 149 material+brand lines and 115 distinct material names.

## Sheets and header rows

| Sheet | Data rows | Discipline in JSON |
|---|---|---|
| SUMMARY | (summary only, not extracted) | – |
| HVAC | 59 | HVAC |
| PLUMBING | 27 | PLB |
| FF (Fire Fighting) | 13 | FLS |
| FA (Fire Alarm & Life Safety) | 12 | FLS |
| ELECTRICAL | 35 | ELE |
| OTHERS (BMS, Testing) | 3 | BMS → GEN, Water leak detection → GEN, CHW flushing chemicals → HVAC |

- **SUMMARY** (row 4): `SEGMENT | UNIQUE MATERIAL+BRAND | APPROVED / VERBAL | UNDER REVIEW / SUBMITTED | LOG ONLY / PENDING | FILES IN FOLDER | MS PACKS CREATED`. It also has a status colour key and a "GAPS FOUND" list.
- **All six data sheets** have the same header in row 2 (row 1 is a merged title):
  `S.NO | MATERIAL | BRAND / MANUFACTURER | COUNTRY OF ORIGIN | SUPPLIER / LOCAL AGENT | KEY SPECIFICATION | STANDARDS (FROM DOCS) | USED ON PROJECTS | LATEST MS NO. | REV | STATUS | DATE | CONSULTANT COMMENTS (KEY) | MIR REF | OTHER SUBMISSIONS (SAME MATERIAL + BRAND) | CATALOGUE REF | PENDING DOCS | FILE IN FOLDER | SOURCE FILE (ORIGINAL) | PAGES`

## How rows were built

- Each workbook row is one **material + brand**. `USED ON PROJECTS` can list several projects. `LATEST MS NO. / REV / STATUS / DATE` belong to the **first** project listed. The MS-number prefixes confirm this: `GRP-25-PRJ341-…` is Saif, `NBK-…` is NBK, and `MS-HVAC-xx`, `MS-ELE-xx` and so on are Lets Cafe / Mangrove.
- The other projects come from `OTHER SUBMISSIONS`, written as `PROJECT (MS no - status)`. Each one became its own row, which gives one row per project per material+brand. Every project in `USED ON PROJECTS` is covered. These rows have no revision or date in the workbook, so those fields are `null`. They inherit keySpec and supplier from the parent line.
- **Field mapping:** `keySpec` = KEY SPECIFICATION and `supplier` = SUPPLIER / LOCAL AGENT. `remarks` combines any of the following that are present: a non-ISO date, the consultant comments, the MIR ref, pending docs, and the raw MS-number text when it is not a real number.
- **Dates:** a full `dd-mm-yyyy` date goes to `approvedDate` when the status is APPROVED, APPROVED_WITH_COMMENTS or CLOSED. It goes to `submittedDate` when the status is UNDER_REVIEW. In every other case both are null and the raw date is kept in `remarks`. Partial dates (`2025`, `2026`, `10-2025`) and `-` are null, with the raw value in remarks.
- **Not extracted:** country of origin, standards, catalogue ref, file paths and page count. The workbook has no unit column, so `unit` is null everywhere. It has no price or money columns, and none appeared in the text.
- **Material names** are kept as written (upper case). No case or spacing duplicates were found. Near-synonyms were left separate, for example `DISTRIBUTION BOARDS (DB)` and `DISTRIBUTION BOARDS & SWITCHGEAR`, and `FIRE RATED CABLES 2C (FA)` and `FIRE RESISTANT CABLES (FA)`.

## Project-name mapping

| Workbook name | `project` | Reason |
|---|---|---|
| AL SAIF TOWER (SANAD) | `SAFE` | "Saif" = Safe Tower (assumption: the seed's client is "Group Three", the workbook says SANAD; please confirm) |
| MANGROVE VILLA 5105 | `MANG` | |
| NBK KHALIFA PARK (MOTIF) | `NBK` | |
| LETS CAFE (AL QANA) | `null` | not an app project |
| JEREH OFFICE (OMEGA TOWER) | `null` | not an app project (closeout references only) |

The workbook has no rows for NYU, SNS, KAMAL or FAB, and no rows marked "all projects" / general. No row uses `GENERAL`.

## Row count and status per project

| Workbook project name | `project` | Rows | APPROVED | APPROVED_WITH_COMMENTS | UNDER_REVIEW | DRAFT | CLOSED | REJECTED |
|---|---|---|---|---|---|---|---|---|
| AL SAIF TOWER (SANAD) | SAFE | 74 | 9 | 61 | 3 | 1 | 0 | 0 |
| LETS CAFE (AL QANA) | null | 41 | 0 | 0 | 41 | 0 | 0 | 0 |
| MANGROVE VILLA 5105 | MANG | 38 | 0 | 0 | 22 | 16 | 0 | 0 |
| NBK KHALIFA PARK (MOTIF) | NBK | 33 | 0 | 0 | 22 | 11 | 0 | 0 |
| JEREH OFFICE (OMEGA TOWER) | null | 5 | 0 | 0 | 0 | 0 | 5 | 0 |
| **Total** | | **191** | 9 | 61 | 88 | 28 | 5 | 0 |

## Status mapping (every distinct raw status seen)

These choices follow the rules given in the task. Notes:
- Verbal approvals count as **APPROVED**. The workbook's own SUMMARY counts them as approved, and the raw wording is kept in `statusRaw`.
- "PENDING" counts as **UNDER_REVIEW**. That includes MS-084, which was rejected on 25-12-2025 and resubmitted on 18-04-2026.
- Items with no MS document are **DRAFT**: log-only, datasheet, quote, PO, shop drawing, supplier offer.
- Catalogue-in-folder items count as **UNDER_REVIEW**.
- No row is currently REJECTED.

| Raw status (as written) | App status | Rows |
|---|---|---|
| APPROVED | APPROVED | 3 |
| APPROVED (A) | APPROVED | 1 |
| APPROVED (log 08-05-2026) | APPROVED | 1 |
| APPROVED (log 10-04-2026) | APPROVED | 1 |
| APPROVED (log 10-04-2026) - file is R&R copy | APPROVED | 1 |
| VERBALLY APPROVED (MOM 4) | APPROVED | 2 |
| APPROVED AS NOTED (AWB) | APPROVED_WITH_COMMENTS | 7 |
| APPROVED AS NOTED (B) | APPROVED_WITH_COMMENTS | 35 |
| APPROVED AS NOTED (B) - VERBAL per MOM 2 | APPROVED_WITH_COMMENTS | 1 |
| APPROVED WITH COMMENTS | APPROVED_WITH_COMMENTS | 17 |
| APPROVED WITH COMMENTS (workshop 28-03-2026) | APPROVED_WITH_COMMENTS | 1 |
| CLOSEOUT REF (installed) | CLOSED | 5 |
| DATASHEET ONLY - MS NOT FOUND | DRAFT | 4 |
| DRAFT - NOT YET SUBMITTED | DRAFT | 1 |
| INSTALLATION DWG ONLY | DRAFT | 1 |
| LOG ONLY - CONFLICT WITH PDF | DRAFT | 1 |
| LOG ONLY - NO DOCUMENT FOUND | DRAFT | 4 |
| NOT SUBMITTED | DRAFT | 9 |
| PO APPROVED (P/KR/00687) - MS NOT FOUND | DRAFT | 1 |
| QUOTE AD25/4045 - MS NOT FOUND | DRAFT | 2 |
| QUOTE APPROVED | DRAFT | 2 |
| SHOP DRAWING ONLY - MS NOT FOUND | DRAFT | 1 |
| SUPPLIER OFFER | DRAFT | 2 |
| CATALOGUE IN MS FOLDER - status not recorded | UNDER_REVIEW | 9 |
| PENDING | UNDER_REVIEW | 2 |
| PENDING (rejected 25-12-2025, resubmitted 18-04-2026) | UNDER_REVIEW | 1 |
| SUBMITTED (status not in log) | UNDER_REVIEW | 41 |
| SUBMITTED - status not recorded | UNDER_REVIEW | 13 |
| UNDER REVIEW | UNDER_REVIEW | 21 |
| UNDER REVIEW (R00 16-09-2026) | UNDER_REVIEW | 1 |

## Data problems

- **Missing MS numbers (20 rows, `msNo` = null):**
  - 9 Mangrove items marked "(no MS - created)" / "(no MS)". These are datasheet, quote, PO or drawing only.
  - 5 Jereh rows marked `CLOSEOUT`.
  - 2 NBK rows marked "(supplier offer)".
  - 2 Mangrove rows marked "(quote only)".
  - 1 Saif diesel fire pump draft, `GRP-25-PRJ341-OPS-MS- (no no.)`.
  - The Mangrove CHW pipe entry "MS-HVAC (CHW pipe)" is incomplete and is set to null (1 row).
- **Duplicate MS numbers within a project:**
  - Saif `GRP-25-PRJ341-OPS-MS-056` covers two lines (Firex FF materials and Bristol sprinklers). It looks like one combined submittal.
  - Mangrove `MS-HVAC-05` appears twice, once with KINGSPAN and once with PAL. The log says PAL and the PDF says KINGSPAN. The workbook flags this as "CONFLICT WITH PDF".
- **No brand (`brand` = null):** PLUMBING #18 SOUND PROOF PIPES (Saif MS-237) and FF #6 FIRE HOSE REEL CABINET (Saif MS-223).
- **Unconfirmed brands:**
  - "DAIKIN (TBC)", "SDS / POTTER (TBC)", "TBC (FURSE / ITT / WALLIS / ERICO per spec)" and "FP (see manual)".
  - Mangrove pumps: Davey and Wilo, while the Powergas drawings show GRUNDFOS.
- **Odd MS number formats:** `MS-HVAC-015` (Lets Cafe) and `NBK-MS-010` use a 3-digit form where the rest use 2 digits. They are kept as written.
- **Approval status not recorded:** the Lets Cafe and Mangrove logs record no approval status. Every Lets Cafe row is UNDER_REVIEW, and none of these may really be approved.
- **Gaps the workbook reports itself (SUMMARY):**
  - For MS-041, 051, 087, 082 and 207 the latest approved copy could not be reached.
  - MS-084, 218, 223 and 237 have no file.
  - The Lets Cafe MAKE column is misaligned.
- **Missing dates:** 76 rows have neither date. That is all 42 "other submission" rows plus partial or `-` dates.

## Example rows

```json
{
  "project": "SAFE",
  "projectName": "AL SAIF TOWER (SANAD)",
  "discipline": "PLB",
  "material": "PPR PIPES & FITTINGS",
  "brand": "WAVIN",
  "keySpec": "PPR PN20 pipes & fittings; DIN 8077/8078",
  "unit": null,
  "supplier": "TRADITIONAL ORIENT ELECTROMECHANICAL",
  "msNo": "GRP-25-PRJ341-OPS-MS-092",
  "revision": "R01",
  "status": "APPROVED_WITH_COMMENTS",
  "statusRaw": "APPROVED AS NOTED (B)",
  "submittedDate": null,
  "approvedDate": "2026-04-06",
  "remarks": "MIR: MIR-030/071"
}
```
```json
{
  "project": "NBK",
  "projectName": "NBK KHALIFA PARK (MOTIF)",
  "discipline": "ELE",
  "material": "WIRING CABLES (LSF)",
  "brand": "OMAN CABLES",
  "keySpec": "LSZH single core wiring; BS 6004 / BS 7211",
  "unit": null,
  "supplier": "ADMMI",
  "msNo": "NBK-MS-010",
  "revision": "R01",
  "status": "UNDER_REVIEW",
  "statusRaw": "UNDER REVIEW",
  "submittedDate": "2026-09-22",
  "approvedDate": null,
  "remarks": "Pending docs: Consultant response awaited"
}
```
```json
{
  "project": null,
  "projectName": "LETS CAFE (AL QANA)",
  "discipline": "HVAC",
  "material": "ACOUSTIC DUCT LINER",
  "brand": "AEROFOAM (HIRA)",
  "keySpec": "Acoustic duct liner; ISO 354",
  "unit": null,
  "supplier": "AFREEN",
  "msNo": "MS-HVAC-07",
  "revision": "R0",
  "status": "UNDER_REVIEW",
  "statusRaw": "SUBMITTED (status not in log)",
  "submittedDate": "2025-06-17",
  "approvedDate": null,
  "remarks": "Pending docs: Consultant approval status / stamped copy not found"
}
```
```json
{
  "project": "MANG",
  "projectName": "MANGROVE VILLA 5105",
  "discipline": "HVAC",
  "material": "VRF SYSTEM (OUTDOOR + INDOOR)",
  "brand": "DAIKIN",
  "keySpec": "RXYTQ8/10U5YF outdoor + FXSQ40-125A ducted indoor, BRC1H82W controllers",
  "unit": null,
  "supplier": "DAIKIN AIRCONDITIONING LLC",
  "msNo": null,
  "revision": null,
  "status": "DRAFT",
  "statusRaw": "PO APPROVED (P/KR/00687) - MS NOT FOUND",
  "submittedDate": null,
  "approvedDate": null,
  "remarks": "Date in log: 07-11-2025; Pending docs: Manufacturer technical data sheet (model-specific); Compliance statement vs project specification; Country of origin certificate; Manufacturer / agency authorisation letter; Test certificates / type test reports; Draft warranty letter; Previous project approvals; Material schedule / quantities & locations; Product catalogue / engineering data book (RXYTQ, FXSQ); Selection report (capacity at site conditions); MS no. in log: (no MS - created)"
}
```
```json
{
  "project": null,
  "projectName": "JEREH OFFICE (OMEGA TOWER)",
  "discipline": "HVAC",
  "material": "CHW FAN COIL UNITS (FCU)",
  "brand": "FP (see manual)",
  "keySpec": "FCU O&M manual (scanned)",
  "unit": null,
  "supplier": null,
  "msNo": null,
  "revision": null,
  "status": "CLOSED",
  "statusRaw": "CLOSEOUT REF (installed)",
  "submittedDate": null,
  "approvedDate": null,
  "remarks": "Date in log: 2025; Pending docs: Original approved MS not in folders (closeout O&M only); MS no. in log: CLOSEOUT"
}
```