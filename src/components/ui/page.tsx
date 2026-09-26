import type { ReactNode } from "react";
import { cx } from "./cx";

type PageShellProps = {
  children: ReactNode;
  /** Max content width. Phone-first screens use "sm". */
  width?: "sm" | "md" | "lg" | "xl";
  /** Vertically center the content (auth, loading, and error screens). */
  center?: boolean;
  /** Reserve room for the bottom tab bar or a sticky action bar. */
  bottomInset?: boolean;
  className?: string;
};

const WIDTHS = {
  sm: "max-w-md",
  md: "max-w-2xl",
  lg: "max-w-4xl",
  xl: "max-w-6xl",
};

export function PageShell({
  children,
  width = "sm",
  center = false,
  bottomInset = false,
  className,
}: PageShellProps) {
  return (
    <main
      className={cx(
        "min-h-dvh bg-canvas text-fg px-4 sm:px-6",
        center && "flex flex-col items-center justify-center",
        bottomInset ? "pb-28" : "pb-10",
      )}
      style={{ paddingTop: "max(1.5rem, env(safe-area-inset-top))" }}
    >
      <div className={cx("mx-auto w-full", WIDTHS[width], className)}>{children}</div>
    </main>
  );
}
