/* Generates simple MEP drawing PDFs for demo data and tests (pdf-lib). A3 landscape, KEM title block. */
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export const PT_PER_MM = 72 / 25.4;
const BLACK = rgb(0, 0, 0);
const CYAN = rgb(0, 0.706, 0.941);
const GREY = rgb(0.55, 0.55, 0.55);

export type Dim = { x: number; y: number; mm: number; vertical?: boolean; label?: string };

/**
 * @param scale drawing scale, e.g. 50 for 1:50
 * Dimension lines are drawn to scale from (x, y) in paper mm from the bottom-left corner.
 */
export async function drawingPdf(opts: { ref: string; title: string; rev: string; project: string; scale: number; dims: Dim[]; ducts?: boolean }) {
  const doc = await PDFDocument.create();
  doc.setTitle(`${opts.ref} Rev ${opts.rev}`);
  const page = doc.addPage([420 * PT_PER_MM, 297 * PT_PER_MM]); // A3 landscape
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const mm = (v: number) => v * PT_PER_MM;
  const { width, height } = page.getSize();

  page.drawRectangle({ x: mm(10), y: mm(10), width: width - mm(20), height: height - mm(20), borderColor: BLACK, borderWidth: 1.2 });
  // grid
  for (let i = 0; i < 8; i++) {
    const x = mm(40 + i * 45);
    page.drawLine({ start: { x, y: mm(60) }, end: { x, y: mm(270) }, color: GREY, thickness: 0.4, dashArray: [6, 3] });
    page.drawText(String.fromCharCode(65 + i), { x: x - 3, y: mm(273), size: 9, font: bold, color: GREY });
  }
  if (opts.ducts) {
    page.drawRectangle({ x: mm(50), y: mm(180), width: mm(260), height: mm(12), borderColor: CYAN, borderWidth: 1.5 });
    page.drawRectangle({ x: mm(120), y: mm(110), width: mm(10), height: mm(70), borderColor: CYAN, borderWidth: 1.5 });
    page.drawText("GI DUCT 600x300", { x: mm(140), y: mm(194), size: 8, font, color: CYAN });
  }
  // dimension lines (to scale)
  for (const d of opts.dims) {
    const len = mm(d.mm / opts.scale);
    const s = { x: mm(d.x), y: mm(d.y) };
    const e = d.vertical ? { x: s.x, y: s.y + len } : { x: s.x + len, y: s.y };
    page.drawLine({ start: s, end: e, color: BLACK, thickness: 0.8 });
    const tick = (p: { x: number; y: number }) =>
      page.drawLine({ start: { x: p.x - 4, y: p.y - 4 }, end: { x: p.x + 4, y: p.y + 4 }, color: BLACK, thickness: 0.8 });
    tick(s);
    tick(e);
    const label = d.label ?? String(d.mm);
    if (d.vertical) page.drawText(label, { x: s.x + 5, y: s.y + len / 2, size: 9, font });
    else page.drawText(label, { x: s.x + len / 2 - 10, y: s.y + 5, size: 9, font });
  }
  // title block
  const tb = { x: width - mm(150), y: mm(10), w: mm(140), h: mm(40) };
  page.drawRectangle({ x: tb.x, y: tb.y, width: tb.w, height: tb.h, borderColor: BLACK, borderWidth: 1 });
  page.drawText("KEM", { x: tb.x + 8, y: tb.y + tb.h - 18, size: 16, font: bold, color: CYAN });
  page.drawText("Kahraba Electromechanical Services LLC", { x: tb.x + 50, y: tb.y + tb.h - 16, size: 8, font });
  page.drawText(opts.title, { x: tb.x + 8, y: tb.y + tb.h - 36, size: 10, font: bold });
  page.drawText(`${opts.ref}   Rev ${opts.rev}   Scale 1:${opts.scale} @ A3   ${opts.project}`, { x: tb.x + 8, y: tb.y + 12, size: 8, font });
  return Buffer.from(await doc.save());
}
