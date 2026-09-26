import type { HTMLAttributes } from "react";
import { cx } from "./cx";

type CardProps = HTMLAttributes<HTMLDivElement> & {
  /** "surface" is the default card; "sunken" sits inside a card. */
  tone?: "surface" | "sunken" | "accent";
  padded?: boolean;
};

const TONES = {
  surface: "bg-surface border-line",
  sunken: "bg-sunken border-line",
  accent: "bg-accent-soft border-accent/30",
};

export function Card({ tone = "surface", padded = true, className, ...props }: CardProps) {
  return (
    <div
      className={cx("rounded-3xl border", TONES[tone], padded && "p-5", className)}
      {...props}
    />
  );
}

/** Small uppercase label that sits above a card title. */
export function Eyebrow({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cx("text-[11px] font-semibold uppercase tracking-[0.14em] text-fg-faint", className)}
      {...props}
    />
  );
}
