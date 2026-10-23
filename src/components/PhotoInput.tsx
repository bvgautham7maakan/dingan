"use client";
import { useEffect, useId, useState } from "react";
import { useTranslations } from "next-intl";
import { compressPhoto } from "@/lib/offline/media";

/** Big camera button. Hands back a compressed photo blob (kept by the caller until saved). */
export default function PhotoInput({
  label,
  required,
  value,
  onChange,
}: {
  label: string;
  required?: boolean;
  value: Blob | null;
  onChange: (b: Blob | null) => void;
}) {
  const t = useTranslations("media");
  const id = useId();
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!value) return setUrl(null);
    const u = URL.createObjectURL(value);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [value]);
  return (
    <div className="field">
      <span className="label">
        {label}
        {required && " *"}
      </span>
      <label htmlFor={id} className="btn btn-big photo-btn">
        📷 {value ? t("retake") : t("takePhoto")}
      </label>
      <input
        id={id}
        type="file"
        accept="image/*"
        capture="environment"
        className="visually-hidden"
        aria-label={label}
        onChange={async (e) => {
          const f = e.target.files?.[0];
          onChange(f ? await compressPhoto(f) : null);
        }}
      />
      {url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={t("preview")} className="photo-preview" />
      )}
      {required && !value && <span className="caption">⚠ {t("photoRequired")}</span>}
    </div>
  );
}
