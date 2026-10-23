/**
 * Drawing measurement maths. Points are in PDF page units at zoom 1 (top-left origin),
 * so a measurement does not depend on the zoom it was taken at.
 */
export type Pt = [number, number];

export function dist(a: Pt, b: Pt) {
  return Math.hypot(b[0] - a[0], b[1] - a[1]);
}

/** Sum of segment lengths (point-to-point = 2 points, chain = more). */
export function polylineLength(points: Pt[]) {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += dist(points[i - 1], points[i]);
  return total;
}

/** mm per page unit from a known dimension. */
export function mmPerUnit(calibration: { pxLength: number; realMm: number }) {
  if (!(calibration.pxLength > 0) || !(calibration.realMm > 0)) throw new Error("bad_calibration");
  return calibration.realMm / calibration.pxLength;
}

export function lengthMm(points: Pt[], calibration: { pxLength: number; realMm: number }) {
  return Math.round(polylineLength(points) * mmPerUnit(calibration) * 10) / 10;
}

/** Scale label for a drawing, e.g. "≈ 1:50" for A-size sheets (1 pt = 0.3528 mm). */
export function scaleLabel(calibration: { pxLength: number; realMm: number }) {
  const paperMm = calibration.pxLength * (25.4 / 72);
  const ratio = calibration.realMm / paperMm;
  return `≈ 1:${ratio >= 10 ? Math.round(ratio) : ratio.toFixed(1)}`;
}

export function fmtMm(mm: number) {
  return mm >= 1000 ? `${mm.toLocaleString("en-US", { maximumFractionDigits: 0 })} mm (${(mm / 1000).toFixed(2)} m)` : `${mm.toFixed(0)} mm`;
}
