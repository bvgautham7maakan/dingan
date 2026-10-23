# KEM reference timesheet: workbook notes

Source: Google Drive `1DUz6nirF0wKXoCIUl-IsQUhtBeiBHhnI`, "KEM Timesheet 26-Aug to 25-Sep 2026.xlsx".
Extracted from the real .xlsx (openpyxl), so formulas are **quoted, not inferred**, unless marked "inferred".
The salary/money columns were skipped. Only their header names are listed here. In this workbook they are blank anyway: no salaries have been entered.

Sheets, in order: `Summary`, `Settings`, `Employees`, `Daily Log`, `Timesheet`, `Review`.

Display convention: hour cells use number format `0.0;\-0.0;\-`, so a computed **0 shows as "-"**. The JSON samples store the underlying number (0).

---

## 1. Summary (A1:C25)

- A1: `Kahraba Electromechanical Services LLC`
- A2: `="Workers timesheet summary  |  "&TEXT(Settings!B4,"dd-mmm-yyyy")&" to "&TEXT(Settings!B5,"dd-mmm-yyyy")` → "Workers timesheet summary | 26-Aug-2026 to 25-Sep-2026"
- Row 4 headers: `Metric` | `Value` | `Note`

| Metric | Formula | Value | Note |
|---|---|---|---|
| Employees on roll | `=COUNTIF(Employees!C2:C35,"Active")` | 33 | From Employees sheet |
| Worker-days present | `=Timesheet!AH40` | 717 | Status P in Daily Log |
| Normal hours | `=Timesheet!AI40` | 5,512.0 | Mon–Sat, 8 hrs/day |
| OT hours @ 1.25 (normal days) | `=Timesheet!AJ40` | 201.0 | Hours beyond 9-hr shift |
| OT hours @ 1.5 (Sunday / PH) | `=Timesheet!AK40` | 225.0 | All hours worked on Sun/PH, lunch deducted |
| Annual leave days | `=Timesheet!AL40` | 53 | |
| Sick leave days | `=Timesheet!AM40` | 11 | |
| Other leave days (CL/LV/A) | `=Timesheet!AN40` | 18 | |
| Total OT amount (AED) | `=Timesheet!AS40` | (money: skipped) | Fills in once basic salaries are entered |
| Total gross (AED) | `=Timesheet!AT40` | (money: skipped) | Basic + OT |
| Salaries missing | `=COUNTIFS(Employees!C2:C35,"Active",Employees!E2:E35,"")` | 33 | Enter in Employees col E |
| Days not yet entered | `=COUNTIFS('Daily Log'!$F$2:$F$1055,"",'Daily Log'!$E$2:$E$1055,"<>Employee*")/1` | 30 | Blank status rows (25-Sep + blank employees excluded) |

"How to use" (A18–A23, verbatim):
1. Employees: enter basic salary (yellow) and names for E32–E34.
2. Daily Log: one row per worker per day — edit Status, Time in/out, Site (blue text). Hours calculate automatically.
3. Status codes: P present · OFF Sunday/PH off · AL annual · SL sick · CL leave · LV leave type TBC · A absent · LEFT.
4. Settings: holidays, rates, hours. Next month: change Period start and replace Daily Log entries.
5. Timesheet: monthly grid + OT pay. Review: data issues found in the source PDFs.

A25 footer: `Kahraba Electromechanical Services LLC · Musaffah, Abu Dhabi, UAE · +971 2 546 9810 · info@kahrabaelectromechanical.com`

## 2. Settings (A1:C27), verbatim

- A1: `Kahraba Electromechanical Services LLC`
- A2: `Timesheet settings — yellow cells are inputs`
- Row 3 headers: `Parameter` | `Value` | `Note / source`

| Cell | Parameter | Value | Note / source |
|---|---|---|---|
| B4 | Period start | 26-Aug-2026 | Cycle runs 26th to 25th |
| B5 | Period end | `=EDATE(B4,1)-1` → 25-Sep-2026 | Formula |
| B6 | Normal paid hours / day (Mon–Sat) | 8 | User: 9 hr shift incl. 1 hr lunch |
| B7 | Lunch break (hrs) | 1 | User-stated |
| B8 | Deduct lunch only if shift longer than (hrs) | 5 | Matches daily reports: 4–5 hr holiday shifts had no lunch deducted |
| B9 | OT rate — normal day (x) | 1.25 | User-stated |
| B10 | OT rate — Sunday / public holiday (x) | 1.50 | User-stated |
| B11 | Days per month (hourly rate divisor) | 30 | Hourly rate = Basic ÷ 30 ÷ 8 (user: monthly salary basis) |

Public holidays (A14 title `Public holidays`; row 15 headers `Date` | `Name`; inputs A16:A25):
- 28-Aug-2026: `Public holiday (user-stated)` (the only one)
- A27: `Add further holidays in A16:A25; Daily Log day-type and all totals update automatically.`

**Leave codes:** Settings has no leave-code table and no paid/unpaid flags. The codes are defined only in text (Summary A21, Timesheet A3): `P` present, `OFF` Sunday/PH off, `AL` annual leave, `SL` sick, `CL` leave, `LV` leave (type TBC), `A` absent, `LEFT`, blank = not entered. Paid status is never stated. In effect every code is paid: Timesheet A43 says "Gross = Basic + OT. No deduction applied for leave or partial month".

## 3. Employees (A1:G37)

Headers (row 1): `Emp ID` | `Name` | `Status` | `Last day` | `Basic salary (AED/month)` (money, skipped) | `Hourly rate (AED)` (money, skipped) | `Remarks`

- Hourly rate formula: `=IF(E2="","",E2/Settings!$B$11/Settings!$B$6)`.
- Rows 2–35 hold E01–E34. Status is `Active` or `Left`. E13 Nigesh is `Left`, with Last day 13-Sep-2026 and the remark "Not in daily reports from 14-Sep (confirmed left)".
- E32–E34 are named `Employee 32/33/34`, Status `Active`, with the remark "Add name — not in daily reports". In employees.json they are `PLACEHOLDER` with name null.
- **The sheet has no trade, designation or join-date columns.** Those fields are null in employees.json. I added `lastDay` from the "Last day" column.
- A37: `Enter each worker's monthly basic salary in column E (yellow). Hourly rate = Basic ÷ 30 ÷ 8.`

## 4. Daily Log (A1:Q1055)

There is no title row. Headers are in row 1:
`Date` | `Day` | `Day type` | `Emp ID` | `Name` | `Status` | `Time in` | `Time out` | `Site` | `Shift span (hrs)` | `Worked (hrs)` | `Normal (hrs)` | `OT 1.25 (hrs)` | `OT 1.5 (hrs)` | `Reported OT (hrs)` | `Remarks` | `Key`

The sheet has 1,054 rows: 31 days × 34 employees, sorted by date and then Emp ID. It has **no "Shift" column**, so `shift` is null in the samples. Night shift is recognised only from the times. The formulas are the same on every row (row 2 shown):

| Col | Header | Formula / input |
|---|---|---|
| A | Date | input (`d-mmm-yy`) |
| B | Day | `=A2` formatted `ddd` |
| C | Day type | `=IF(COUNTIF(Settings!$A$16:$A$25,A2)>0,"PH",IF(WEEKDAY(A2)=1,"Sunday","Normal"))`. PH takes priority over Sunday. |
| E | Name | `=INDEX(Employees!$B$2:$B$35,MATCH(D2,Employees!$A$2:$A$35,0))` |
| F,G,H,I | Status, Time in, Time out, Site | inputs (times `hh:mm`) |
| J | Shift span (hrs) | `=IF(AND(F2="P",G2<>"",H2<>""),ROUND(MOD(H2-G2,1)*24,2),0)`. The MOD handles shifts past midnight. Span is 0 unless Status = P. |
| K | Worked (hrs) | `=IF(J2=0,0,J2-IF(J2>Settings!$B$8,Settings!$B$7,0))`. Deducts 1 h lunch only if span > 5. |
| L | Normal (hrs) | `=IF(C2<>"Normal",0,IF(J2>=Settings!$B$6,Settings!$B$6,K2))` |
| M | OT 1.25 (hrs) | `=IF(C2<>"Normal",0,MAX(0,J2-(Settings!$B$6+Settings!$B$7)))`. This is span − 9. |
| N | OT 1.5 (hrs) | `=IF(C2="Normal",0,K2)`. On Sunday/PH this is all worked hours, after the lunch rule. |
| O | Reported OT (hrs) | input copied from the daily reports. Not used in any total. |
| P | Remarks | input |
| Q | Key | `=D2&"|"&TEXT(A2,"yyyymmdd")`, e.g. `E01|20260826` |

Observed patterns (Status P; values from the sheet):

| Day type | In–Out | Span | Worked | Normal | OT1.25 | OT1.5 | Rows |
|---|---|---|---|---|---|---|---|
| Normal | 08:00–17:00 | 9 | 8 | 8 | 0 | 0 | 585 |
| Normal | 08:00–18:00…23:00 | 10–15 | 9–14 | 8 | 1–6 | 0 | 36 |
| Normal | 06:00–17:00 | 11 | 10 | 8 | 2 | 0 | 7 |
| Normal | 20:00–08:00 (Zahoor) | 12 | 11 | 8 | **3** | 0 | 25 |
| Normal | 23:00–07:00 (night) | 8 | 7 | **8** | 0 | 0 | 36 |
| PH | 08:00–12:00 / 13:00 | 4 / 5 | 4 / 5 (no lunch) | 0 | 0 | 4 / 5 | 4 |
| PH / Sunday | 08:00–17:00 | 9 | 8 | 0 | 0 | 8 | 19 |
| PH / Sunday | 20:00–08:00 | 12 | 11 | 0 | 0 | 11 | 5 |

- **Night shift:** no formula checks for night times. The 23:00–07:00 shift has a span of 8, which is ≥ 8, so `Normal` = 8 even though `Worked` = 7. Its OT is max(0, 8−9) = 0. The Remarks column says "Night shift 23:00–07:00 counted as full 8-hr day".
- **Short shifts (≤5 h):** no lunch is deducted. In this period they occur only on the PH (28-Aug). On a Normal day a span under 8 would give Normal = Worked. That means span − 1 when the span is over 5, and the span itself when it is 5 or less. This is inferred from the formula; no such rows exist.
- **Sunday/PH worked:** Normal = 0, OT1.25 = 0, OT1.5 = Worked.
- **Leave and other codes (OFF/AL/SL/CL/LV/LEFT/blank):** span is 0 because Status ≠ P, so all hour columns are 0 (shown "-"). Times and site are blank. Remarks such as "report had times filled — ignored" mark rows where the source had times, but they are not used.
- Status counts: P 717, OFF 120 (Sunday 103, PH 17), AL 53 (6 of them on Sunday/PH), LV 15, LEFT 12 (E13, 14–25 Sep), SL 11, CL 3, blank 123 (25-Sep for everyone, plus E32–E34 on every day). `A` (absent) is defined but **never used**.

## 5. Timesheet (A1:AT43)

- A1: `Kahraba Electromechanical Services LLC`
- A2: `="Workers timesheet  |  "&TEXT(Settings!B4,"dd-mmm-yyyy")&" to "&TEXT(Settings!B5,"dd-mmm-yyyy")`
- A3: `Cell = hours worked (normal + OT) · codes: OFF Sunday/holiday off · AL annual leave · SL sick · CL leave · LV leave (type TBC) · A absent · LEFT · blank = not entered. Bold black day header = Sunday/PH.`
- Row 4, C4:AG4: `=Settings!$B$4+0` … `+30`, shown as weekday (`Wed`, `Thu`, …).
- Row 5 headers: `ID` | `Name` | C5:AG5 = the same dates, shown as day number (`26`,`27`,…,`31`,`01`,…,`25`) | `Days worked` | `Normal hrs` | `OT 1.25 hrs` | `OT 1.5 hrs` | `AL days` | `Sick days` | `Other leave days` | money columns (skipped): `Basic (AED)` | `Hourly rate` | `OT 1.25 amt (AED)` | `OT 1.5 amt (AED)` | `Total OT (AED)` | `Gross (AED)`
- Rows 6–39 hold one row per employee (E01–E34). B = `=INDEX(Employees!$B$2:$B$35,n)`.
- **Day cell** (C6 … AG39): the formula looks up the Daily Log row by key `ID|yyyymmdd`. If Status = "P", the cell shows **Normal + OT1.25 + OT1.5** (paid hours, not the Worked column, so a 23:00–07:00 shift shows 8). If Status is blank, the cell is blank. Otherwise it shows the status code text. `IFERROR(...,"")` covers a missing key. Cells with more than 8 h are cyan bold (per A43).
- Right-hand totals (row 6):
  - `Days worked` = `COUNTIFS(DL!D,$A6,DL!F,"P")`. This includes Sundays/PH worked.
  - `Normal hrs` / `OT 1.25 hrs` / `OT 1.5 hrs` = `SUMIFS` of Daily Log L / M / N by Emp ID.
  - `AL days` = COUNTIFS status "AL". This includes AL rows that fall on Sunday/PH.
  - `Sick days` = COUNTIFS status "SL".
  - `Other leave days` = COUNTIFS of "CL" + "LV" + "A".
  - OFF, LEFT and blank are not counted anywhere.
  - Money columns: hourly rate = Basic/30/8, OT amount = hours × hourly rate × 1.25 or 1.5, Total OT = sum of both, Gross = Basic + Total OT. These are formulas only; the values are blank.
- Row 40 `TOTAL`: `=SUM(AH6:AH39)` and so on → 717.0 / 5512.0 / 201.0 / 225.0 / 53.0 / 11.0 / 18.0.
- Row 41 `Present`: `=COUNT(C6:C39)` per day (counts numeric cells).
- A43: `Gross = Basic + OT. No deduction applied for leave or partial month (e.g. Nigesh, last day 13-Sep) — adjust in Employees if needed. Cyan bold cell = worked > 8 hrs.`

## 6. Review (A1:D15)

Headers: `Review #` | `Issue in daily reports` | `Where` | `Applied in this workbook`. It has 14 rows, all text. Key rows:
1. The 28-Aug report file is dated 29-08 inside. It is treated as the 28-Aug public holiday.
2. Sun/PH 08:00–17:00 was logged as 9 h. The workbook applies 8 h (1 h lunch deducted).
3. Zahoor's Sun/PH 20:00–08:00 was logged as 12 h. The workbook applies 11 h.
4. 06:00–17:00 with no OT on 18-Sep. The workbook applies 2 h OT each, as on 17-Sep.
5. Night shift 23:00–07:00 is an 8-hr span (7 hrs after lunch). It is "Counted as full 8-hr day, no OT" (36 shifts, 26-Aug to 03-Sep).
6. Times filled for workers on leave are ignored. 7. Summary box counts in the reports were wrong; the table rows were used. 8. Leave not split sick/other is coded LV.
9. Site typos. 10. 08:00–"01:00" on the holiday is read as 13:00 (5 h). 11. The 25-Sep report is missing, so those rows are blank.
12. Nigesh is LEFT from 14-Sep. 13. The reports show 31 workers against 34 stated; E32–E34 are blank. 14. Zahoor has a 12-hr night shift on all 30 days with no rest day; HR should check this.

---

## 7. Differences from the brief rules

| Brief rule | Workbook behaviour |
|---|---|
| Mon–Sat 8 normal paid hours | Matches for spans ≥ 8. **Difference:** a Normal-day span under 8 gets Normal = Worked (less than 8). Any span from 8 to 9 (e.g. 08:00–16:00) gets the full 8 normal hours although only 7–8 h are worked. |
| Lunch 1 h deducted only if shift > 5 h | Matches (`J>5`). |
| OT ×1.25 = hours beyond a 9-h shift on normal days | Matches (`span − 9`). OT is computed from span, not worked hours (span − 9 = worked − 8). |
| Sun/PH: all hours ×1.5, lunch rule applies | Matches (`N = Worked`, Normal = 0). PH takes priority over Sunday. **Not covered by the brief:** a PH falling Mon–Sat that is not worked is coded OFF with 0 hours (normal hours are not credited). AL is still counted on Sundays/PH. |
| Night shift 23:00–07:00 = full 8-h day, no OT | Same result, but **no explicit night rule**: it falls out of the "span ≥ 8 → 8 normal" formula. **Difference:** Zahoor's 20:00–08:00 night shift (25 Normal-day rows) gets 8 normal + **3 h OT 1.25**. The brief does not say whether 20:00–08:00 counts as night shift. |
| Cycle 26th → 25th | Matches (`EDATE(start,1)-1`). |
| Leave paid/unpaid | Not defined anywhere. Gross = Basic + OT with no deduction, so all leave, A and LEFT days are effectively paid. Hourly rate = Basic ÷ 30 ÷ 8. |
| Timesheet day cell | Shows paid hours (Normal + OT), not Worked hours: a night shift shows 8 while Worked is 7. |
