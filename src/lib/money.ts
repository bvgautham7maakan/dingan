import { canSeeMoney } from "./roles";

/** A key carries an AED value if it ends in "Fils" or starts with "aed" (e.g. aedTotal). */
export function isMoneyKey(key: string): boolean {
  return /Fils$/.test(key) || /^aed[A-Z_]/.test(key) || key === "aed";
}

/** Deep-copies `data` without any money keys. Dates are kept as-is. */
export function stripMoney<T>(data: T): T {
  if (Array.isArray(data)) return data.map((v) => stripMoney(v)) as T;
  if (data && typeof data === "object" && !(data instanceof Date)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
      if (isMoneyKey(k)) continue;
      out[k] = stripMoney(v);
    }
    return out as T;
  }
  return data;
}

export function moneyFor<T>(roles: readonly string[], data: T): T {
  return canSeeMoney(roles) ? data : stripMoney(data);
}

export function formatAed(fils: number | null | undefined): string {
  if (fils == null) return "–";
  return (
    "AED " +
    (fils / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  );
}
