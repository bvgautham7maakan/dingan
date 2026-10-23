"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import SyncStatus from "@/components/SyncStatus";
import PhotoInput from "@/components/PhotoInput";
import VoiceNote from "@/components/VoiceNote";
import { useCachedApi } from "@/components/offline/useCachedApi";
import { enqueue, enqueueFile } from "@/lib/offline/outbox";
import { BILL_TYPES } from "@/lib/sync/schema";
import type { DriverDay } from "@/lib/logistics/types";

/** Fuel / Salik / Fine. Only the driver's form has an amount field (brief 7.4). */
export default function BillForm() {
  const t = useTranslations("bill");
  const { data, queue } = useCachedApi<DriverDay>("/api/driver");
  const [type, setType] = useState<(typeof BILL_TYPES)[number] | "">("");
  const [vehicleId, setVehicleId] = useState("");
  const [amount, setAmount] = useState("");
  const [odo, setOdo] = useState("");
  const [note, setNote] = useState("");
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [voice, setVoice] = useState<Blob | null>(null);
  const [done, setDone] = useState(false);
  if (!data) return <p className="muted">…</p>;
  const vid = vehicleId || data.myVehicleId || data.vehicles[0]?.id || "";
  const amountOk = !data.isDriver || Number(amount) > 0;
  const ready = type && vid && photo && amountOk;
  const queued = queue.filter((m) => m.type === "bill.create").length;

  const save = async () => {
    if (!ready) return;
    const photoClientId = await enqueueFile(photo!, "bills");
    const voiceClientId = voice ? await enqueueFile(voice, "bills") : undefined;
    await enqueue({
      id: crypto.randomUUID(), type: "bill.create", at: new Date().toISOString(),
      payload: {
        date: data.today, type: type as (typeof BILL_TYPES)[number], vehicleId: vid,
        amount: data.isDriver ? Number(amount) : undefined,
        odometer: odo ? Number(odo) : undefined, photoClientId, voiceClientId, note: note.trim() || undefined,
      },
    });
    setType(""); setAmount(""); setOdo(""); setNote(""); setPhoto(null); setVoice(null); setDone(true);
  };

  return (
    <div className="att">
      <SyncStatus />
      {done && <p className="notice notice-ok" role="status">✓ {t("saved")}</p>}
      <fieldset className="chips-row">
        <legend className="label">{t("type")} *</legend>
        {BILL_TYPES.map((b) => (
          <button key={b} type="button" className="chip" aria-pressed={type === b} onClick={() => (setType(b), setDone(false))}>
            {t(`type_${b}`)}
          </button>
        ))}
      </fieldset>
      <div className="field">
        <label htmlFor="b-veh">{t("vehicle")}</label>
        <select id="b-veh" value={vid} onChange={(e) => setVehicleId(e.target.value)}>
          {data.vehicles.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
        </select>
      </div>
      {data.isDriver && (
        <div className="field">
          <label htmlFor="b-amt">{t("amount")} *</label>
          <input id="b-amt" type="number" inputMode="decimal" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
      )}
      <div className="field">
        <label htmlFor="b-odo">{t("odometer")}</label>
        <input id="b-odo" type="number" inputMode="numeric" min="0" value={odo} onChange={(e) => setOdo(e.target.value)} />
      </div>
      <PhotoInput label={t("photo")} required value={photo} onChange={setPhoto} />
      <VoiceNote value={voice} onChange={setVoice} />
      <div className="field">
        <label htmlFor="b-note">{t("note")}</label>
        <input id="b-note" value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      <button type="button" className="btn btn-primary btn-big" disabled={!ready} onClick={() => void save()}>
        ✓ {t("save")}
      </button>

      <h2>{t("recent")}</h2>
      {queued > 0 && <p className="status status-amber">● {t("onPhone", { count: queued })}</p>}
      <ul className="plain-list">
        {data.bills.map((b) => (
          <li key={b.id}>
            {b.date.split("-").reverse().join("-")} · {t(`type_${b.type}`)} · {b.vehicle}
            {b.odometer != null && ` · ${b.odometer} km`}
          </li>
        ))}
      </ul>
    </div>
  );
}
