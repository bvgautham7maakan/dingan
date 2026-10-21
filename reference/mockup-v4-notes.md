# Mockup V4 — extracted notes

Source: Google Drive `MOCKUP V4.pdf` (id `156106YMpwjfZBahF-3_utIH8wG6nfm7M`), 31 pages, dated 21 Oct 2026, "For review".
Prepared by: Dinga (Gautham B V), Project Engineer. Pilot project: NBK.

## Extraction limits (read first)

- Only the **page titles and the caption under each screen** came through as text. The screen mockups themselves are images: every in-screen label, button, chip, tab, field, card title, status text, step bar and colour/size note is **unreadable** via text extraction.
- Section (a)–(f) detail asked for below is therefore limited to what the captions say. To get the in-screen content, the page images must be viewed (not done: base64 download was out of scope).
- From page 14 to page 18 the running page header lags one page behind the caption (e.g. page 15 header "Head supervisor · Renjith", caption "Site supervisor · Sanu"). Pages below are assigned by **caption**.
- Page footer on every page: "Kahraba Electromechanical Services LLC · Musaffah, Abu Dhabi, UAE · +971 2 546 9810 · info@kahrabaelectromechanical.com · Page N of 31".
- Cover note: "Names, sites and roles are real; numbers, dates and records are sample data."

## Page map

| Page | Screen | Role / device |
|---|---|---|
| 1 | Cover | — |
| 2 | What's new in V4 & approval chains | — |
| 3 | Divider: Office role dashboards — one per position (9 screens) | — |
| 4 | BUL · Nobin | Office (desktop + mobile per caption) |
| 5 | Operations Manager · Yadhukrishnan V | Office |
| 6 | PM · Yadhukrishnan S | Office |
| 7 | PE · Dinga | Office |
| 8 | SE · Sachin | Office |
| 9 | Estimator · Deepak | Office |
| 10 | Design · Alwin | Office |
| 11 | Coordinator / DC · Aswin | Office |
| 12 | Procurement · Azhar | Office |
| 13 | Divider: Site role homes — mobile (4 screens) | Mobile |
| 14 | Head supervisor · Renjith | Mobile |
| 15 | Site supervisor · Sanu (Vishnu, Aneesh same) | Mobile |
| 16 | HVAC supervisor · Jitendar | Mobile |
| 17 | Driver · Ali | Mobile |
| 18 | Divider: Site task screens — mobile (7 screens) | Mobile |
| 19 | Attendance | Mobile |
| 20 | Move workers | Mobile |
| 21 | Daily report | Mobile |
| 22 | Vehicles | Mobile |
| 23 | Driver bill entry | Mobile |
| 24 | Supervisor bill entry | Mobile |
| 25 | Drawing measure | Mobile |
| 26 | Divider: Office workflows (5 screens) | Office |
| 27 | Project dashboard (manpower & timesheet) | Office |
| 28 | Material request approval chain | Office |
| 29 | Drawing viewer & measure | Office |
| 30 | Coordination register | Office |
| 31 | Users & sessions | Office |

Note: cover says "9 office role dashboards · 4 site role homes · 7 site task screens · 5 office workflows". Pages 4–12 hold 9 office dashboards + pages 14–17 hold 4 site homes = 13 role dashboards.

---

## p1 — Cover

- "Site Coordination Platform Mockup V4 — role dashboards for team review"
- Prepared by: Dinga (Gautham B V), Project Engineer · Date: 21 October 2026 · Pilot project: NBK
- Screens: 9 office role dashboards · 4 site role homes · 7 site task screens · 5 office workflows

## p2 — What's new in V4 & approval chains

What's new in V4 (as written):
- 13 role dashboards — one per position, built from your answers
- Approval chains updated: Estimator step, PM-or-Ops rule, BUL above AED 100k
- HIGH-ALERT panel (qty over BOQ/drawings, brand not in MS) for SE & PE only
- Renjith: approvals for moves & vehicle plan, duty assignment with deadlines, safety checks
- Supervisor home with duties; Jitendar HVAC home with T&C and equipment
- Driver home: vehicle check, trips with map link, delivery proof photo
- Procurement: quote comparison with split-order suggestion (savings checked)
- Canvas organised in 3 pages: role dashboards · site mobile · office workflows

Approval chains (table on page):

| Item | Chain |
|---|---|
| Material request / LPO | Requester → SE/PE → Estimator → PM (his projects) / Ops (others) → BUL if > AED 100k → Procurement |
| Variation / CCR | SE (if assigned) → PE → Estimator prices → PM → Ops Manager → client |
| WIR / MIR | Supervisor/SE → SE → PE → consultant |
| Daily report | Supervisor → Renjith → SE |
| Manpower moves / vehicle plan | Supervisor / Jitendar → Renjith |
| Duties | Renjith → supervisor (deadline) → done + photo → SE & PE updated |
| Tender | Estimator → BUL |
| Subcontractor bill | PE verifies → PM → SABR pack (Aswin) |
| IPA | → PM approves (earlier steps to confirm) |

---

## (d) Role dashboards — 13 roles

For every dashboard: cards, pending lists, labels and buttons inside the screen are **unreadable**. Captions only:

### p4 — BUL · Nobin (office; "desktop + mobile")
- Approves LPOs > AED 100,000 and tender submissions
- Portfolio, cost vs budget, manpower, cash flow, tender pipeline, authority approvals
- Filtered: CCR pending only, critical alerts only, subcontractor issues only, overdue team items only
- Combined weekly report (PDF); summary cards with drill-down; desktop + mobile

### p5 — Operations Manager · Yadhukrishnan V (office)
- Everything in full detail (all BUL widgets unfiltered + procurement savings)
- Approves the PM step on projects with no PM assigned
- Final CCR approval before the client

### p6 — PM · Yadhukrishnan S (office)
- His projects by default, all projects via toggle
- Approves material requests (his projects), CCR, subcontractor bills, IPA
- Schedule (programme vs actual + 2-week look-ahead), deliveries, site status board
- Tomorrow's manpower & vehicle plan — view only

### p7 — PE · Dinga (office)
- HIGH-ALERT panel pinned on top: qty above BOQ/drawing take-off, brand not in approved MS
- Pending items, drawing review queue, site progress feed (installed vs BOQ)
- Full project visibility; PM/Ops/BUL approvals shown view-only
- Approves material requests, CCR, WIR/MIR, subcontractor bills

### p8 — SE · Sachin (office)
- HIGH-ALERT panel on top; sees AED
- Approves material requests (first step), CCR verification, WIR/MIR, daily reports
- Today's site board, drawing review queue, progress feed, deliveries

### p9 — Estimator · Deepak (office)
- Approves material purchase before PM/Ops/BUL (budget + rate check)
- Tender pipeline, take-off from BOQ + drawings, CCR pricing
- Price list & history, subcontractor comparison, budget handover, estimate vs actual

### p10 — Design · Alwin (office)
- No AED shown
- Answers site queries and RFIs; releases drawings 'for construction'
- Drawing tasks, review comments, submittal status, RFI status to client/consultant

### p11 — Coordinator / DC · Aswin (office)
- Access same as PE; approves nothing
- Builds and sends SABR packs, issues transmittals, records MOM & chases actions
- Submittal/transmittal log, document register, accounts tracking, procurement support

### p12 — Procurement · Azhar (office)
- Procurement data only, all projects
- Approved requests → quotes → LPO; quote comparison with split-order suggestion
- Deliveries, site store stock, suppliers, accounts tracking (SABR)

### p14 — Head supervisor · Renjith (HEAD_SUP, mobile)
- Approves manpower moves and the daily vehicle plan
- All sites' attendance, safety checks, supervisor duties
- Assigns duties with deadlines; tracks them and updates SE & PE

### p15 — Site supervisor · Sanu (Vishnu, Aneesh same) (mobile)
- Duties from Renjith with deadlines — mark done with photo
- Attendance, safety check, material request (qty only), move workers, ask design, approved drawings
- Assigned site by default, others via toggle; no AED

### p16 — HVAC supervisor · Jitendar (mobile)
- Supervisor set filtered to HVAC across all sites
- HVAC crew moves (Renjith approves), T&C checklists, equipment delivery & installation

### p17 — Driver · Ali (mobile)
- Vehicle check before start (photo)
- Trips today/tomorrow with map link, started/delivered status, delivery proof photo
- Add fuel / Salik / fine bills

---

## (a) p19 — Attendance (mobile, supervisor)

Caption: "Pre-filled from Renjith's plan; IN / OUT / LATE; shift chips; reason codes"

| Item asked for | Found |
|---|---|
| Plan list | Pre-filled from Renjith's plan (list contents unreadable) |
| IN / OUT / LATE | Named in caption; button styling/text unreadable |
| Late chips | unreadable |
| OUT reasons | "reason codes" named; the codes themselves unreadable |
| Shift chips | named; chip labels unreadable |
| "Mark all remaining" | not in extracted text (unreadable) |
| Add worker | not in extracted text (unreadable) |
| Sync status text | not in extracted text (unreadable) |

## (b) HEAD_SUP daily plan (workers → site + vehicle)

- No dedicated plan screen title in the text. Related captions: p14 Renjith "Approves manpower moves and the daily vehicle plan"; p6 PM "Tomorrow's manpower & vehicle plan — view only"; p19 attendance "Pre-filled from Renjith's plan"; p22 Vehicles "Renjith approves the daily plan".
- Chain: Manpower moves / vehicle plan: Supervisor / Jitendar → Renjith.
- Plan layout (worker rows, site/vehicle pickers): unreadable.

## (c) Timesheet — p27 Project dashboard (manpower & timesheet) (office)

- Caption: "Man-days used vs remaining, moves, daily log feeding the monthly timesheet"
- Timesheet columns, export button/format: unreadable (no export text in extraction).

## (e) p21 — Daily report (mobile, supervisor)

- Caption: "4 steps; checked by Renjith, then SE"
- Chain: Supervisor → Renjith → SE
- Names of the 4 steps / step bar: **unreadable**.

## (f) Other workflows

### p20 — Move workers (mobile; manpower move)
- Emergency moves go now and Renjith approves after; other reasons wait for approval
- Vehicle booked in the same step; hours split between sites
- Reason list, fields, buttons: unreadable

### p22 — Vehicles (mobile; logistics)
- Clash flag; Renjith approves the daily plan
- Driver home (p17): vehicle check before start (photo); trips today/tomorrow with map link, started/delivered status, delivery proof photo; add fuel / Salik / fine bills

### p23 — Driver bill entry (mobile)
- Photo required; amount in AED for driver only

### p24 — Supervisor bill entry (mobile)
- No AED field — accounts tracking reads amount from photo

### p28 — Material request approval chain (office) + HIGH-ALERT
- SE/PE → Estimator → PM (or Ops) → BUL if > AED 100k → Procurement
- Each user sees only the action for their own step
- Supervisor raises material request with qty only (p15)
- HIGH-ALERT (p2, p7, p8): qty over BOQ/drawings (drawing take-off), brand not in approved MS; SE & PE only; pinned on top for PE
- Status texts / step bar: unreadable

### Site query
- No dedicated screen. Supervisor home lists "ask design" (p15); Design · Alwin "Answers site queries and RFIs" (p10). Query form: unreadable / not present as text.

### p25 — Drawing measure (mobile)
- Approved revisions only; snap measuring; zoom buttons

### p29 — Drawing viewer & measure (office)
- DWG/PDF in-app, snap measuring, layers, revisions

---

## Other office workflows

### p30 — Coordination register
- Status by font colour + text label (colours/labels themselves unreadable)

### p31 — Users & sessions
- Stay signed in; Admin/PM sign out all devices; per-site start times
