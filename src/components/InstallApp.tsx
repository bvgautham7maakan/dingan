"use client";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

const HIDE_KEY = "kem-install-hidden";

function standalone() {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
}

function isIos() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

/** "Install app" button (Android Chrome) or Add-to-Home-Screen steps (iPhone). Hidden once installed. */
export default function InstallApp({ dismissible = false }: { dismissible?: boolean }) {
  const t = useTranslations("install");
  const [mode, setMode] = useState<"none" | "button" | "ios">("none");

  useEffect(() => {
    const update = () => {
      if (standalone()) return setMode("none");
      if (dismissible) {
        try {
          if (localStorage.getItem(HIDE_KEY)) return setMode("none");
        } catch {}
      }
      if (window.__kemInstall) return setMode("button");
      setMode(isIos() ? "ios" : "none");
    };
    update();
    window.addEventListener("kem-install-change", update);
    return () => window.removeEventListener("kem-install-change", update);
  }, [dismissible]);

  if (mode === "none") return null;

  const install = async () => {
    const p = window.__kemInstall;
    if (!p) return;
    await p.prompt();
    await p.userChoice.catch(() => null);
    // the saved prompt can only be used once
    window.__kemInstall = null;
    setMode("none");
  };

  const hide = () => {
    try {
      localStorage.setItem(HIDE_KEY, "1");
    } catch {}
    setMode("none");
  };

  return (
    <section className="notice install" aria-labelledby="install-h" data-testid="install-app">
      <h2 id="install-h">{t("title")}</h2>
      {mode === "button" ? (
        <>
          <p>{t("why")}</p>
          <button type="button" className="btn btn-primary btn-big" onClick={install}>
            {t("button")}
          </button>
        </>
      ) : (
        <p>{t("ios")}</p>
      )}
      {dismissible && (
        <button type="button" className="btn" onClick={hide}>
          {t("notNow")}
        </button>
      )}
    </section>
  );
}
