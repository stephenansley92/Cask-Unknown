import { cx } from "./cx";

const STATUS: Record<string, { label: string; className: string }> = {
  setup: { label: "Setting up", className: "bg-raised text-fg-muted" },
  scoring: { label: "Scoring", className: "bg-accent-soft text-accent" },
  reveal_ready: { label: "Soft reveal", className: "bg-accent-soft text-accent" },
  revealed: { label: "Revealed", className: "bg-success-soft text-success" },
  closed: { label: "Closed", className: "bg-raised text-fg-faint" },
};

export function sessionStatusLabel(status: string | null | undefined) {
  return STATUS[(status || "").toLowerCase()]?.label ?? "Setting up";
}

export function StatusPill({ status, className }: { status: string | null | undefined; className?: string }) {
  const meta = STATUS[(status || "").toLowerCase()] ?? STATUS.setup;
  return (
    <span
      className={cx(
        "inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-[11px] font-semibold",
        meta.className,
        className,
      )}
    >
      {meta.label}
    </span>
  );
}
