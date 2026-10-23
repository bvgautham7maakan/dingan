// Status label: colour + icon + text (never colour alone). Colours per brief 7.5.
const MAP: Record<string, { cls: string; icon: string }> = {
  DRAFT: { cls: "status-grey", icon: "○" },
  UNDER_REVIEW: { cls: "status-blue", icon: "◔" },
  APPROVED: { cls: "status-green", icon: "✓" },
  APPROVED_WITH_COMMENTS: { cls: "status-amber", icon: "✓!" },
  REJECTED: { cls: "status-red", icon: "✕" },
  CLOSED: { cls: "status-black", icon: "—" },
  ACTIVE: { cls: "status-green", icon: "●" },
  ORDERED: { cls: "status-green", icon: "✓" },
  RETURNED: { cls: "status-red", icon: "↩" },
  INACTIVE: { cls: "status-grey", icon: "○" },
  ON_HOLD: { cls: "status-amber", icon: "‖" },
  LEFT: { cls: "status-grey", icon: "○" },
  PLACEHOLDER: { cls: "status-grey", icon: "…" },
};

export default function Status({ code, label }: { code: string; label: string }) {
  const s = MAP[code] ?? { cls: "status-grey", icon: "•" };
  return (
    <span className={`status ${s.cls}`}>
      <span aria-hidden="true">{s.icon}</span> {label}
    </span>
  );
}
