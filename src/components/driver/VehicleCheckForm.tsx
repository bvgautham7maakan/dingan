"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import SyncStatus from "@/components/SyncStatus";
import PhotoInput from "@/components/PhotoInput";
import { useCachedApi } from "@/components/offline/useCachedApi";
import { enqueue, enqueueFile } from "@/lib/offline/outbox";
import type { DriverDay } from "@/lib/logistics/types";

type Ok = boolean | null;

function YesNo({ label, value, onChange }: { label: string; value: Ok; onChange: (v: boolean) => void }) {
  const t = useTranslations("drv");
  return (
    <fieldset className="chips-row">
      <legend className="label">{label}</legend>
      <button type="button" className="chip" aria-pressed={value === true} onClick={() => onChange(true)}>✓ {t("ok")}</button>
      <button type="button" className="chip chip-alert" aria-pressed={value === false} onClick={() => onChange(false)}>✕ {t("problem")}</button>
    </fieldset>
  );
}

export default function VehicleCheckForm() {
  const t = useTranslations("drv");
  const router = useRouter();
  const { data } = useCachedApi<DriverDay>("/api/driver");
  const [vehicleId, setVehicleId] = useState<string>("");
  const [tyres, setTyres] = useState<Ok>(null);
  const [oil, setOil] = useState<Ok>(null);
  const [lights, setLights] = useState<Ok>(null);
  const [damage, setDamage] = useState("");
  const [photo, setPhoto] = useState<Blob | null>(null);
  if (!data) return <p className="muted">…</p>;
  const vid = vehicleId || data.myVehicleId || data.vehicles[0]?.id || "";
  const ready = vid && tyres !== null && oil !== null && lights !== null && photo;

  const save = async () => {
    if (!ready) return;
    const photoClientId = await enqueueFile(photo!, "logistics");
    await enqueue({
      id: crypto.randomUUID(), type: "vehicle.check", at: new Date().toISOString(),
      payload: { date: data.today, vehicleId: vid, tyresOk: tyres!, oilOk: oil!, lightsOk: lights!, damageNote: damage.trim() || undefined, photoClientId },
    });
    router.push("/m/trips");
  };

  return (
    <div className="att">
      <SyncStatus />
      <div className="field">
        <label htmlFor="vc-veh">{t("vehicle")}</label>
        <select id="vc-veh" value={vid} onChange={(e) => setVehicleId(e.target.value)}>
          {data.vehicles.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
        </select>
      </div>
      <YesNo label={t("tyres")} value={tyres} onChange={setTyres} />
      <YesNo label={t("oil")} value={oil} onChange={setOil} />
      <YesNo label={t("lights")} value={lights} onChange={setLights} />
      <div className="field">
        <label htmlFor="vc-dmg">{t("damage")}</label>
        <textarea id="vc-dmg" rows={2} value={damage} onChange={(e) => setDamage(e.target.value)} />
      </div>
      <PhotoInput label={t("vehiclePhoto")} required value={photo} onChange={setPhoto} />
      <button type="button" className="btn btn-primary btn-big" disabled={!ready} onClick={() => void save()}>
        ✓ {t("saveCheck")}
      </button>
    </div>
  );
}
