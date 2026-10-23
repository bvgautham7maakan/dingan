import { getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth/current";
import { BILL_OFFICE_ROLES, BILL_ROLES } from "@/lib/logistics/server";
import { hasAnyRole } from "@/lib/roles";
import { formatAed } from "@/lib/money";
import { fmtIsoDay } from "@/lib/time";
import BillForm from "@/components/driver/BillForm";
import Submit from "@/components/Submit";
import { checkBill } from "./actions";

// Site users get the entry form; office roles (who may see AED) get the list with amounts.
export default async function BillsPage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const me = await requireRole([...BILL_ROLES, ...BILL_OFFICE_ROLES]);
  const t = await getTranslations("bill");
  const tn = await getTranslations("nav");
  const sp = await searchParams;
  const office = hasAnyRole(me.roles, BILL_OFFICE_ROLES);
  const bills = office
    ? await db.driverBill.findMany({ include: { vehicle: true, driver: true }, orderBy: { createdAt: "desc" }, take: 100 })
    : [];
  return (
    <>
      <h1>{tn("bills")}</h1>
      {hasAnyRole(me.roles, BILL_ROLES) && <BillForm />}
      {office && (
        <>
          {sp.saved && <p className="notice notice-ok" role="status">✓ {t("checked")}</p>}
          <div className="table-wrap" tabIndex={0}>
            <table className="kem">
              <thead>
                <tr>
                  <th>{t("date")}</th><th>{t("type")}</th><th>{t("vehicle")}</th><th>{t("by")}</th><th>{t("odometer")}</th>
                  <th>{t("photo")}</th><th>{t("amountShort")}</th><th>{t("status")}</th>
                </tr>
              </thead>
              <tbody>
                {bills.length === 0 && <tr><td colSpan={8} className="muted">–</td></tr>}
                {bills.map((b) => (
                  <tr key={b.id}>
                    <td>{fmtIsoDay(b.date)}</td>
                    <td>{t(`type_${b.type}`)}</td>
                    <td>{b.vehicle.name}</td>
                    <td>{b.driver.displayName}</td>
                    <td>{b.odometer ?? "–"}</td>
                    <td>
                      <a href={`/api/files/${b.photoId}`} target="_blank" rel="noopener noreferrer">{t("view")}</a>
                      {b.voiceFileId && <> · <a href={`/api/files/${b.voiceFileId}`} target="_blank" rel="noopener noreferrer">🎤</a></>}
                      {b.note && <div className="caption">{b.note}</div>}
                    </td>
                    <td>
                      {b.status === "CHECKED" ? (
                        formatAed(b.amountFils)
                      ) : (
                        <form action={checkBill} className="row">
                          <input type="hidden" name="id" value={b.id} />
                          <input name="amount" type="number" step="0.01" min="0" defaultValue={b.amountFils != null ? b.amountFils / 100 : ""} aria-label={t("amountShort")} style={{ width: 110 }} required />
                          <Submit className="btn">{t("check")}</Submit>
                        </form>
                      )}
                    </td>
                    <td>{b.status === "CHECKED" ? <span className="status status-green">✓ {t("status_CHECKED")}</span> : <span className="status status-blue">◔ {t("status_SUBMITTED")}</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
