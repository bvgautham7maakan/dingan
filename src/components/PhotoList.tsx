"use client";
import { useEffect, useId, useState } from "react";
import { useTranslations } from "next-intl";
import { compressPhoto } from "@/lib/offline/media";

/** Several photos: big "Add photo" button + thumbnails with remove. */
export default function PhotoList({ label, value, onChange, max = 10 }: { label: string; value: Blob[]; onChange: (b: Blob[]) => void; max?: number }) {
  const t = useTranslations("media");
  const id = useId();
  const [urls, setUrls] = useState<string[]>([]);
  useEffect(() => {
    const u = value.map((b) => URL.createObjectURL(b));
    setUrls(u);
    return () => u.forEach((x) => URL.revokeObjectURL(x));
  }, [value]);
  return (
    <div className="field">
      <span className="label">{label} ({value.length}/{max})</span>
      {value.length < max && (
        <label htmlFor={id} className="btn btn-big photo-btn">📷 {t("addPhoto")}</label>
      )}
      <input
        id={id}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        className="visually-hidden"
        aria-label={label}
        onChange={async (e) => {
          const files = [...(e.target.files ?? [])].slice(0, max - value.length);
          const shrunk = await Promise.all(files.map((f) => compressPhoto(f)));
          onChange([...value, ...shrunk]);
          e.target.value = "";
        }}
      />
      <div className="thumbs">
        {urls.map((u, i) => (
          <div key={u} className="thumb">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={u} alt={`${t("preview")} ${i + 1}`} />
            <button type="button" className="btn-link" onClick={() => onChange(value.filter((_, j) => j !== i))}>
              {t("delete")}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
