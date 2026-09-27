import type { LabelHTMLAttributes } from "react";
import { cx } from "./cx";

type InputStyleOptions = {
  /** "textarea" drops the fixed height and adds vertical padding. */
  kind?: "input" | "textarea" | "select";
  /** "sm" matches `md` buttons (h-11); "md" is the default form field (h-12). */
  size?: "sm" | "md";
  className?: string;
};

/**
 * Class string for text inputs, textareas and selects. As with buttons,
 * don't override height/padding/colors through `className` — add an option.
 */
export function inputStyles({ kind = "input", size = "md", className }: InputStyleOptions = {}) {
  return cx(
    "w-full min-w-0 rounded-2xl border border-line bg-sunken px-4 text-fg placeholder:text-fg-faint",
    "focus:border-accent focus:outline-none disabled:cursor-not-allowed disabled:opacity-60",
    kind === "textarea" ? "py-3 text-sm" : size === "sm" ? "h-11 text-sm" : "h-12",
    kind === "select" && "appearance-none pr-10",
    className,
  );
}

/** Form label that sits above an input. */
export function FieldLabel({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cx("mb-1.5 block text-sm font-semibold text-fg", className)} {...props} />;
}
