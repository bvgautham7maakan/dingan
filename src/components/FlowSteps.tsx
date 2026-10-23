"use client";
// Client copy of the step bar (StepBar.tsx renders on the server).
type Step = { seq: number; label: string; status: string; actedBy: string | null; comment: string | null };
const ICON: Record<string, string> = { APPROVED: "✓", PENDING: "●", WAITING: "○", RETURNED: "↩", SKIPPED: "–" };
const TEXT: Record<string, string> = { APPROVED: "done", PENDING: "waiting", WAITING: "later", RETURNED: "returned", SKIPPED: "skipped" };

export default function FlowSteps({ steps }: { steps: Step[] }) {
  return (
    <ol className="stepbar" aria-label="Approval steps">
      {steps.map((s) => (
        <li key={s.seq} className={`step step-${s.status.toLowerCase()}`}>
          <span className="step-icon" aria-hidden="true">{ICON[s.status] ?? "•"}</span>
          <span className="step-label">
            {s.label}
            <span className="step-state"> – {TEXT[s.status] ?? s.status}</span>
            {s.actedBy && <span className="caption"> {s.actedBy}</span>}
            {s.comment && <span className="step-comment">“{s.comment}”</span>}
          </span>
        </li>
      ))}
    </ol>
  );
}
