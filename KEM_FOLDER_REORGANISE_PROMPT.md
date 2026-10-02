```
TASK: Reorganise this existing KEM project folder into the standard KEM project structure.
Work on ONE project folder at a time. If several are connected, ask me which one first.

STEP 0 — SETUP
- If the project folder isn't connected, ask me to connect it (desktop app: "+" → Add folder).
- Load the kem-context and kem-branding skills.
- Read the full folder tree: every subfolder, file name, size and modified date.
- Open and read the key documents (LOA, contract, BOQ, scope) to get project details and disciplines.

STEP 1 — TARGET STRUCTURE (use these exact names)
00_PROJECT INFO        Contract, LOA, contacts, scope
01_BOQ & COMMERCIAL    BOQ, CCR (Client Requested Change Request), Variations, Invoices/IPA
02_DRAWINGS            IFC / SHOP / AS-BUILT → [disciplines]
03_SUBMITTALS          MATERIAL / SHOP DWG / METHOD STATEMENT / DESIGN → [disciplines]
04_QAQC                WIR, MIR, INSPECTION, T&C, NCR
05_CORRESPONDENCE      Letters, RFI, Transmittals
06_MOM
07_REPORTS             Weekly, Monthly, Site Photos
08_SCHEDULE
09_PROCUREMENT         LPOs, Quotes, Delivery Notes
10_SUBCONTRACTORS
11_AUTHORITY           Civil Defence, ADDC, etc.
12_HANDOVER            O&M, Warranties, Test Certs
13_TEAM                One empty folder per person, nothing else inside
14_TEMPLATES           MIR, WIR, MS, TECHNICAL SUBMITTAL, DESIGN SUBMITTAL, RFI,
                       CLOSEOUT CHECKLIST (Commissioning Reports, T&C Reports,
                       Approved MS, Warranty, COO, TDS)
99_MISC

[disciplines] = derive from the BOQ/scope in the folder.
Full MEP set: HVAC (incl. VFD) | ELECTRICAL | PLUMBING & DRAINAGE | FLS (FF + FA) | BMS | ELV
No BOQ/scope found → create the full MEP set and flag it.
Create only the subfolders that apply; don't create empty discipline folders that aren't in scope.

STEP 2 — OLD → NEW MAPPING RULES
| Old                                   | New                                   |
|---------------------------------------|---------------------------------------|
| BOQ                                   | 01_BOQ & COMMERCIAL                   |
| CCCR / CCR                            | 01_BOQ & COMMERCIAL\CCR               |
| DRAWINGS                              | 02_DRAWINGS\[IFC/SHOP/AS-BUILT]\[disc]|
| MATERIAL SUBMITTAL                    | 03_SUBMITTALS\MATERIAL\[disc]         |
| INSPECTION REPORTS, WIR, MIR          | 04_QAQC\[INSPECTION/WIR/MIR]          |
| MOM                                   | 06_MOM                                |
| PROGRESS + WEEKLY REPORT              | 07_REPORTS (merge)                    |
| SCHEDULE + SCHEDULES                  | 08_SCHEDULE (merge)                   |
| LPO S                                 | 09_PROCUREMENT\LPOs                   |
| MISC DOCS + MISC DOCUMENTS            | 99_MISC (merge)                       |
| Loose discipline folders (BMS, VFD…)  | matching discipline subfolders in 02/03 |
| Personal-name folders (e.g. dhanish)  | 13_TEAM (contents sorted to 00–12; folder kept empty) |
| 13.SERVICES                           | Leave as is — don't touch              |
| AL zne villa / any unrelated project  | Not needed → list for deletion         |

- Sort files by content and file name, not only by their current folder.
- Can't classify a file with confidence → 99_MISC and flag it.
- Don't rename files. If two different files share a name in the same target, add "_2" and flag it.
- After moving, list old folders that are now empty and propose them for deletion.

STEP 3 — DUPLICATES
- Duplicate = same file name + same size, or clearly the same document ("(1)", "copy", "- Copy").
- Keep the latest or approved revision (check Rev no., approval stamp, modified date); delete the rest.
- Never delete the only copy of a file.
- Superseded revisions that are NOT duplicates → keep in a "SUPERSEDED" subfolder in the same location.

STEP 4 — 13_TEAM (default for all projects; empty folders only)
YADHU - OPS MANAGER | YADHU YK - PM | NOBIN - BUL | DEEPAK - ESTIMATOR |
ALWIN - DESIGNER | ASWIN - COORD PROC DC | AZHAR - PROCUREMENT
Then ask me for any additional people (site engineer, supervisor, QA/QC, safety, subcontractors).

STEP 5 — 14_TEMPLATES
- Client templates found in the folder → use those. Otherwise → KAHRABA format (kem-branding).
- Pre-fill project details: project name, project no., client, consultant, main contractor, location.
- Take details from the LOA/contract/BOQ; ask me for anything missing (table: Field | Found | Source).
- Formats: WIR, MIR, MS, RFI, Technical Submittal, Design Submittal → .docx | Closeout checklist → .xlsx

STEP 6 — CONFIRM BEFORE ANY CHANGE
Before moving or deleting anything, show me:
1. Project details table: Field | Value | Source
2. Disciplines detected + source
3. Move plan: | Old path | New path | Action (Move/Merge/Delete/Keep) | Reason |
4. Deletion table: | File/folder | Size | Reason | Kept copy (path) |
5. Flagged items: | Item | Issue | Proposed action |
Wait for my OK. Then execute in this order: create folders → move → merge → delete.
Request delete permission when needed. Stop and report if any step fails.

STEP 7 — AFTER COMPLETION
- Final summary table: folders created | files moved | duplicates deleted | items flagged
- Final folder tree (top 2 levels).
- Remind me to send folder-sharing invitations to everyone in 13_TEAM.
- Offer: build/update the full project schedule in 08_SCHEDULE, and prepare the weekly report
  in 07_REPORTS by analysing the schedule and all project documents.

STYLE: short, tables only, no narrative padding, no apology language.
```
