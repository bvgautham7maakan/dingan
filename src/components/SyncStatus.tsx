"use client";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { pendingCount, startSyncLoop, subscribeOutbox } from "@/lib/offline/outbox";

/** "● Saved on phone · N waiting" / "✓ All sent" */
export default function SyncStatus() {
  const t = useTranslations("sync");
  const [count, setCount] = useState(0);
  const [online, setOnline] = useState(true);
  useEffect(() => {
    startSyncLoop();
    const refresh = () => void pendingCount().then(setCount);
    const net = () => setOnline(navigator.onLine);
    refresh();
    net();
    const unsub = subscribeOutbox(refresh);
    window.addEventListener("online", net);
    window.addEventListener("offline", net);
    return () => {
      unsub();
      window.removeEventListener("online", net);
      window.removeEventListener("offline", net);
    };
  }, []);
  return (
    <p className={`sync-bar ${count ? "sync-wait" : "sync-ok"}`} role="status" data-testid="sync-status">
      {count > 0 ? `● ${t("saved", { count })}` : `✓ ${t("allSent")}`}
      {!online && <span> · {t("noSignal")}</span>}
    </p>
  );
}
