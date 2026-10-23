"use client";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

/** Hold-free voice note: tap to record, tap to stop. Max 2 minutes. */
export default function VoiceNote({ value, onChange }: { value: Blob | null; onChange: (b: Blob | null) => void }) {
  const t = useTranslations("media");
  const [recording, setRecording] = useState(false);
  const [secs, setSecs] = useState(0);
  const [error, setError] = useState(false);
  const rec = useRef<MediaRecorder | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!value) return setUrl(null);
    const u = URL.createObjectURL(value);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [value]);

  const stop = () => {
    rec.current?.stop();
    if (timer.current) clearInterval(timer.current);
    setRecording(false);
  };

  const start = async () => {
    setError(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const r = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      r.ondataavailable = (e) => chunks.push(e.data);
      r.onstop = () => {
        stream.getTracks().forEach((tr) => tr.stop());
        onChange(new Blob(chunks, { type: r.mimeType }));
      };
      rec.current = r;
      r.start();
      setSecs(0);
      setRecording(true);
      timer.current = setInterval(() => setSecs((s) => (s >= 119 ? (stop(), s) : s + 1)), 1000);
    } catch {
      setError(true);
    }
  };

  return (
    <div className="field">
      <span className="label">{t("voiceNote")}</span>
      <div className="row">
        {recording ? (
          <button type="button" className="btn btn-big btn-danger" onClick={stop}>
            ■ {t("stop")} ({secs}s)
          </button>
        ) : (
          <button type="button" className="btn btn-big" onClick={start}>
            🎤 {value ? t("recordAgain") : t("record")}
          </button>
        )}
      </div>
      {url && !recording && (
        <div className="row">
          <audio controls src={url} />
          <button type="button" className="btn-link" onClick={() => onChange(null)}>
            {t("delete")}
          </button>
        </div>
      )}
      {error && <span className="caption">⚠ {t("micBlocked")}</span>}
    </div>
  );
}
