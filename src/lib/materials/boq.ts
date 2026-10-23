import "server-only";
import ExcelJS from "exceljs";
import { db } from "../db";

const norm = (s: string) => s.trim().toUpperCase().replace(/\s+/g, " ");
const DISC = new Set(["ELE", "PLB", "HVAC", "FLS", "GEN"]);

/**
 * BOQ import: first sheet, header row with "Material", "Qty" and optional "Discipline", "Unit", "Rate".
 * Materials are matched by name (and discipline when given); unknown ones are added to the master.
 */
export async function importBoq(projectId: string, buf: Buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ExcelJS.Buffer);
  const ws = wb.worksheets[0];
  if (!ws) throw new Error("no_sheet");
  let headerRow = 0;
  const col: Record<string, number> = {};
  ws.eachRow((row, n) => {
    if (headerRow) return;
    const vals = (row.values as unknown[]).map((v) => String(v ?? "").trim().toLowerCase());
    if (vals.some((v) => v.startsWith("material") || v === "description") && vals.some((v) => v.startsWith("qty") || v.startsWith("quantity"))) {
      headerRow = n;
      vals.forEach((v, i) => {
        if (v.startsWith("material") || v === "description") col.material ??= i;
        else if (v.startsWith("qty") || v.startsWith("quantity")) col.qty ??= i;
        else if (v.startsWith("disc")) col.disc ??= i;
        else if (v.startsWith("unit")) col.unit ??= i;
        else if (v.startsWith("rate")) col.rate ??= i;
      });
    }
  });
  if (!headerRow) throw new Error("no_header");
  const materials = await db.material.findMany();
  let added = 0;
  let updated = 0;
  const skipped: number[] = [];
  for (let n = headerRow + 1; n <= ws.rowCount; n++) {
    const row = ws.getRow(n);
    const cell = (i?: number) => (i ? row.getCell(i).value : null);
    const text = (v: unknown) => (v && typeof v === "object" && "result" in v ? String((v as { result: unknown }).result ?? "") : String(v ?? "")).trim();
    const name = text(cell(col.material));
    const qty = Number(text(cell(col.qty)));
    if (!name || !Number.isFinite(qty) || qty <= 0) {
      if (name) skipped.push(n);
      continue;
    }
    const discRaw = text(cell(col.disc)).toUpperCase();
    const disc = DISC.has(discRaw) ? discRaw : null;
    let mat = materials.find((m) => norm(m.name) === norm(name) && (!disc || m.discipline === disc));
    if (!mat) {
      mat = await db.material.create({ data: { name: norm(name), discipline: disc ?? "GEN" } });
      materials.push(mat);
      added++;
    }
    const rate = Number(text(cell(col.rate)));
    const data = { qty, unit: text(cell(col.unit)) || null, ...(Number.isFinite(rate) && rate > 0 ? { rateFils: Math.round(rate * 100) } : {}) };
    await db.boqLine.upsert({
      where: { projectId_materialId: { projectId, materialId: mat.id } },
      update: data,
      create: { projectId, materialId: mat.id, ...data },
    });
    updated++;
  }
  return { updated, added, skipped };
}
