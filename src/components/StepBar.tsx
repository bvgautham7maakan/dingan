import type { FlowView } from "@/lib/approvals";
import { fmtDateTime } from "@/lib/time";

// ✓ done · ● waiting now · ○ later · ↩ returned. Text labels, never colour alone.
const ICON: Record<string, string> = { APPROVED: "✓", PENDING: "●", WAITING: "○", RETURNED: "↩", SKIPPED: "–" };
const TEXT: Record<string, string> = { APPROVED: "done", PENDING: "waiting", WAITING: "later", RETURNED: "returned", SKIPPED: "skipped" };

export default function StepBar({ flow }: { flow: FlowView }) {
  return (
    <ol className="stepbar" aria-label="Approval steps">
      {flow.steps.map((s) => (
        <li key={s.seq} className={`step step-${s.status.toLowerCase()}`}>
          <span className="step-icon" aria-hidden="true">{ICON[s.status] ?? "•"}</span>
          <span className="step-label">
            {s.label}
            <span className="step-state"> – {TEXT[s.status] ?? s.status}</span>
            {s.actedBy && <span className="caption"> {s.actedBy}, {fmtDateTime(s.actedAt)}</span>}
            {s.comment && <span className="step-comment">“{s.comment}”</span>}
          </span>
        </li>
      ))}
    </ol>
  );
}
