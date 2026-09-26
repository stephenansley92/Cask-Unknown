import { cx } from "./cx";

type WordmarkProps = {
  size?: "sm" | "lg";
  className?: string;
};

export function Wordmark({ size = "sm", className }: WordmarkProps) {
  return (
    <span
      className={cx(
        "font-display font-semibold tracking-tight text-accent",
        size === "lg" ? "text-[2.75rem] leading-[1.05] sm:text-5xl" : "text-xl",
        className,
      )}
    >
      Cask Unknown
    </span>
  );
}

export function LoadingDots({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex gap-1.5" role="status" aria-label={label}>
      <span className="bounce-dot h-2 w-2 rounded-full bg-accent" />
      <span className="bounce-dot h-2 w-2 rounded-full bg-accent" />
      <span className="bounce-dot h-2 w-2 rounded-full bg-accent" />
    </div>
  );
}

/** Full-screen centered loading state used while a page resolves its data. */
export function LoadingScreen({ label = "Loading" }: { label?: string }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-canvas p-6 text-fg">
      <Wordmark size="lg" />
      <LoadingDots label={label} />
    </main>
  );
}
