"use client";
import { useEffect } from "react";
import { startSyncLoop } from "@/lib/offline/outbox";

/** Keeps sending taps saved on the phone, whichever screen is open. */
export default function OutboxBoot() {
  useEffect(() => startSyncLoop(), []);
  return null;
}
