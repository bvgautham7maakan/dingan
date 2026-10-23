"use client";
import Link from "next/link";
import { useState } from "react";
import { useTranslations } from "next-intl";
import SyncStatus from "@/components/SyncStatus";
import PhotoInput from "@/components/PhotoInput";
import { useCachedApi } from "@/components/offline/useCachedApi";
import { enqueue, enqueueFile } from "@/lib/offline/outbox";
import type { DriverDay } from "@/lib/logistics/types";
import type { MutationOf } from "@/lib/sync/schema";

/** Driver home: vehicle check first, then today's / tomorrow's trips with map link and delivery photo. */
export default function DriverScreen() {
  const t = useTranslations("drv");
  const { data, fromCache, failed, queue, reload } = useCachedApi<DriverDay>("/api/driver");
  const [tab, setTab] = useState<"today" | "tomorrow">("today");
  const [delivering, setDelivering] = useState<string | null>(null);
  const [photo, setPhoto] = useState<Blob | null>(null);

  if (failed)
    return (
      <p className="notice notice-error" role="alert">
        {t("noData")} <button className="btn" onClick={() => void reload()}>{t("retry")}</button>
      </p>
    );
  if (!data) return <p className="muted">…</p>;

  const queuedChecks = queue.filter((m): m is MutationOf<"vehicle.check"> => m.type === "vehicle.check").map((m) => m.payload.vehicleId);
  const checked = new Set([...data.checkedVehicleIds, ...queuedChecks]);
  const queuedStatus = new Map(queue.filter((m): m is MutationOf<"trip.status"> => m.type === "trip.status").map((m) => [m.payload.tripId, m.payload.status]));
  const statusOf = (id: string, s: string) => queuedStatus.get(id) ?? s;
  const day = tab === "today" ? data.today : data.tomorrow;
  const trips = data.trips.filter((tr) => tr.date === day);
  const myVehicle = data.vehicles.find((v) => v.id === data.myVehicleId);

  const setStatus = async (tripId: string, status: "STARTED" | "DELIVERED" | "RETURNED", photoBlob?: Blob) => {
    const photoClientId = photoBlob ? await enqueueFile(photoBlob, "logistics") : undefined;
    await enqueue({ id: crypto.randomUUID(), type: "trip.status", at: new Date().toISOString(), payload: { tripId, status, photoClientId } });
    setDelivering(null);
    setPhoto(null);
  };

  return (
    <div className="att">
      <SyncStatus />
      {fromCache && <p className="notice notice-warn">{t("fromPhone")}</p>}

      {myVehicle && (
        <div className={`card ${checked.has(myVehicle.id) ? "" : "card-alert"}`} data-testid="check-card">
          <h3>{myVehicle.name}</h3>
          {checked.has(myVehicle.id) ? (
            <span className="status status-green">✓ {t("checkDone")}</span>
          ) : (
            <>
              <span className="status status-red">⚠ {t("checkFirst")}</span>
              <Link href="/m/vehicle-check" className="btn btn-primary btn-big" style={{ marginTop: 8 }}>
                {t("doCheck")}
              </Link>
            </>
          )}
        </div>
      )}

      <div className="seg" role="group" style={{ marginTop: 16 }}>
        <a href="#" aria-current={tab === "today"} onClick={(e) => (e.preventDefault(), setTab("today"))}>{t("today")}</a>
        <a href="#" aria-current={tab === "tomorrow"} onClick={(e) => (e.preventDefault(), setTab("tomorrow"))}>{t("tomorrow")}</a>
      </div>

      {trips.length === 0 && <p className="muted">{t("noTrips")}</p>}
      <ul className="att-list">
        {trips.map((tr) => {
          const st = statusOf(tr.id, tr.status);
          const canStart = checked.has(tr.vehicleId);
          return (
            <li key={tr.id} className="att-row" data-testid="trip">
              <div className="att-who">
                <b>{tr.out}–{tr.back} · {tr.from} → {tr.to}</b>
                <span className="caption">{tr.vehicle}{tr.purpose && ` · ${tr.purpose}`}</span>
                {tr.passengers.length > 0 && <span>👷 {tr.passengers.join(", ")}</span>}
                {tr.materials && <span>▤ {tr.materials}</span>}
                <span className={`status ${st === "RETURNED" ? "status-green" : st === "PLANNED" ? "status-grey" : "status-blue"}`}>{t(`trip_${st}`)}</span>
              </div>
              <a className="btn btn-big" href={tr.toMap} target="_blank" rel="noopener noreferrer">
                🗺 {t("map", { site: tr.to })}
              </a>
              {tab === "today" && (
                <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
                  {st === "PLANNED" && (
                    <button type="button" className="btn btn-primary btn-big" disabled={!canStart} onClick={() => void setStatus(tr.id, "STARTED")}>
                      ▶ {canStart ? t("start") : t("checkFirst")}
                    </button>
                  )}
                  {(st === "STARTED" || st === "PLANNED") && canStart && delivering !== tr.id && (
                    <button type="button" className="btn btn-big" onClick={() => setDelivering(tr.id)}>
                      📦 {t("delivered")}
                    </button>
                  )}
                  {delivering === tr.id && (
                    <>
                      <PhotoInput label={t("deliveryPhoto")} required value={photo} onChange={setPhoto} />
                      <button type="button" className="btn btn-primary btn-big" disabled={!photo} onClick={() => void setStatus(tr.id, "DELIVERED", photo!)}>
                        ✓ {t("confirmDelivered")}
                      </button>
                    </>
                  )}
                  {(st === "DELIVERED" || st === "STARTED") && (
                    <button type="button" className="btn btn-big" onClick={() => void setStatus(tr.id, "RETURNED")}>
                      ↩ {t("returned")}
                    </button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <Link href="/m/bills" className="btn btn-big" style={{ width: "100%" }}>
        ▭ {t("addBill")}
      </Link>
    </div>
  );
}
