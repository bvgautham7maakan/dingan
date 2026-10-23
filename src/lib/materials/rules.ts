/** HIGH-ALERT rules (brief 7.5) – pure, unit-tested. */
export const APPROVED_MS = ["APPROVED", "APPROVED_WITH_COMMENTS"] as const;

export type Alert = { type: "BRAND_NOT_APPROVED" | "QTY_OVER_BOQ"; detail: string };

const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");

export function checkLine(opts: {
  material: string;
  brand: string | null | undefined;
  approvedBrands: string[];
  qty: number;
  alreadyRequested: number;
  boqQty: number | null;
  unit?: string | null;
}): Alert[] {
  const alerts: Alert[] = [];
  const brand = norm(opts.brand);
  if (!opts.approvedBrands.length) {
    const b = opts.brand?.trim() ? ` brand "${opts.brand.trim()}" –` : "";
    alerts.push({ type: "BRAND_NOT_APPROVED", detail: `${opts.material}:${b} no approved MS for this project` });
  } else if (brand && !opts.approvedBrands.some((b) => norm(b) === brand)) {
    alerts.push({ type: "BRAND_NOT_APPROVED", detail: `${opts.material}: brand "${opts.brand}" is not in the approved MS (${opts.approvedBrands.join(", ")})` });
  }
  if (opts.boqQty != null && opts.qty + opts.alreadyRequested > opts.boqQty) {
    const u = opts.unit ? ` ${opts.unit}` : "";
    alerts.push({
      type: "QTY_OVER_BOQ",
      detail: `${opts.material}: ${opts.qty}${u} now + ${opts.alreadyRequested}${u} already requested = ${opts.qty + opts.alreadyRequested}${u} > BOQ ${opts.boqQty}${u}`,
    });
  }
  return alerts;
}

/** BUL approval is needed only above the threshold (default AED 100,000). */
export function needsBul(totalFils: number | null, thresholdFils: number) {
  return totalFils != null && totalFils > thresholdFils;
}
