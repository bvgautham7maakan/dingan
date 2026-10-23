"use client";
import { useCallback, useEffect, useState } from "react";
import { cacheGet, cacheSet, pending, subscribeOutbox } from "@/lib/offline/outbox";
import type { Mutation } from "@/lib/sync/schema";

/**
 * Loads JSON from the API, keeps a copy on the phone, falls back to it offline,
 * and reloads once the phone's waiting changes have all been sent.
 */
export function useCachedApi<T>(url: string) {
  const [data, setData] = useState<T | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const [failed, setFailed] = useState(false);
  const [queue, setQueue] = useState<Mutation[]>([]);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (res.status === 401) return void (window.location.href = "/login");
      if (!res.ok) throw new Error(String(res.status));
      const json = (await res.json()) as T;
      setData(json);
      setFromCache(false);
      await cacheSet(url, json);
    } catch {
      const cached = await cacheGet<T>(url);
      if (cached) {
        setData(cached);
        setFromCache(true);
      } else setFailed(true);
    }
  }, [url]);

  useEffect(() => void load(), [load]);

  useEffect(() => {
    let prev = -1;
    const refresh = async () => {
      const q = await pending();
      setQueue(q);
      if (prev > 0 && q.length === 0 && navigator.onLine) void load();
      prev = q.length;
    };
    void refresh();
    return subscribeOutbox(() => void refresh());
  }, [load]);

  return { data, fromCache, failed, queue, reload: load };
}
