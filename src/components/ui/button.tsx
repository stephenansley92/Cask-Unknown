import type { ButtonHTMLAttributes } from "react";
import { cx } from "./cx";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "ghostDanger" | "success";
export type ButtonSize = "sm" | "md" | "lg" | "iconLg";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-accent text-on-accent hover:bg-accent-hover",
  secondary: "bg-raised text-fg border border-line hover:border-line-strong hover:bg-line",
  ghost: "text-fg-muted hover:text-fg hover:bg-raised",
  danger: "bg-danger-soft text-danger border border-danger/30 hover:bg-danger/20",
  ghostDanger: "text-danger hover:bg-danger-soft",
  success: "bg-success-soft text-success border border-success/30",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "h-9 px-3 text-xs rounded-xl gap-1.5",
  md: "h-11 px-4 text-sm rounded-2xl gap-2",
  lg: "h-13 px-5 text-base rounded-2xl gap-2",
  iconLg: "h-13 w-13 rounded-2xl",
};

type ButtonStyleOptions = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  className?: string;
};

/**
 * Class string for anything that should look like a button — use it on
 * `<Link>` so navigation stays a real link.
 */
export function buttonStyles({
  variant = "secondary",
  size = "md",
  block = false,
  className,
}: ButtonStyleOptions = {}) {
  return cx(
    "inline-flex shrink-0 items-center justify-center whitespace-nowrap font-semibold select-none",
    "disabled:cursor-not-allowed disabled:opacity-45",
    VARIANTS[variant],
    SIZES[size],
    block && "w-full",
    className,
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & Omit<ButtonStyleOptions, "className">;

export function Button({
  variant,
  size,
  block,
  className,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonStyles({ variant, size, block, className })}
      {...props}
    />
  );
}
