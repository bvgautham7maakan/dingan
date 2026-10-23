"use client";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { isDrawingOffline, removeDrawingOffline, saveDrawingOffline } from "./offline";

export default function OfflineButton({ revisionId, fileId }: { revisionId: string; fileId: string }) {
  const t = useTranslations("dwg");
  const [saved, setSaved] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => void isDrawingOffline(fileId).then(setSaved), [fileId]);
  if (saved === null) return null;
  return (
    <button
      type="button"
      className={`btn ${saved ? "" : "btn-primary"}`}
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          if (saved) await removeDrawingOffline(revisionId, fileId);
          else await saveDrawingOffline(revisionId, fileId);
          setSaved(!saved);
        } finally {
          setBusy(false);
        }
      }}
    >
      {saved ? `✓ ${t("savedOffline")} – ${t("remove")}` : `⭳ ${t("saveOffline")}`}
    </button>
  );
}
