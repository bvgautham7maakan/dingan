"use client";
import { useEffect } from "react";

export type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
declare global {
  interface Window {
    __kemInstall?: InstallPrompt | null;
  }
}

export default function SwRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
    // Chrome on Android fires this once per page load; keep it so any screen can offer "Install app"
    const keep = (e: Event) => {
      e.preventDefault();
      window.__kemInstall = e as InstallPrompt;
      window.dispatchEvent(new Event("kem-install-change"));
    };
    const installed = () => {
      window.__kemInstall = null;
      window.dispatchEvent(new Event("kem-install-change"));
    };
    window.addEventListener("beforeinstallprompt", keep);
    window.addEventListener("appinstalled", installed);
    return () => {
      window.removeEventListener("beforeinstallprompt", keep);
      window.removeEventListener("appinstalled", installed);
    };
  }, []);
  return null;
}
