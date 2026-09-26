import type { ReactNode } from "react";
import { X } from "lucide-react";
import { cx } from "./cx";

type NoticeProps = {
  tone?: "danger" | "success" | "info";
  title?: ReactNode;
  children?: ReactNode;
  onDismiss?: () => void;
  className?: string;
};

const TONES = {
  danger: "bg-danger-soft border-danger/30 text-danger",
  success: "bg-success-soft border-success/30 text-success",
  info: "bg-raised border-line text-fg-muted",
};

export function Notice({ tone = "info", title, children, onDismiss, className }: NoticeProps) {
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={cx("flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm", TONES[tone], className)}
    >
      <div className="min-w-0 flex-1">
        {title ? <div className="font-semibold">{title}</div> : null}
        {children ? <div className={cx(Boolean(title) && "mt-0.5 opacity-90")}>{children}</div> : null}
      </div>
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="-mr-1 rounded-lg p-1 opacity-70 hover:opacity-100"
        >
          <X className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  );
}
