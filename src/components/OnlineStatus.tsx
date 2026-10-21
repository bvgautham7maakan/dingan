"use client";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

export default function OnlineStatus() {
  const t = useTranslations("common");
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  return (
    <span className="sync-pill" role="status" title={online ? t("online") : t("offline")}>
      <span aria-hidden="true">{online ? "●" : "○"}</span>{" "}
      <span className={online ? "sync-text" : undefined}>{online ? t("online") : t("offlineShort")}</span>
    </span>
  );
}
