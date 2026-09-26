"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** Transient message state: `show(text)` clears itself after `durationMs`. */
export function useToast(durationMs = 2200) {
  const [message, setMessage] = useState("");
  const timer = useRef<number | null>(null);

  const show = useCallback(
    (text: string) => {
      setMessage(text);
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setMessage(""), durationMs);
    },
    [durationMs],
  );

  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
    },
    [],
  );

  return { message, show };
}

/** Floating status pill; renders nothing when `message` is empty. */
export function Toast({ message }: { message: string }) {
  if (!message) return null;
  return (
    <div
      role="status"
      className="fixed left-1/2 z-50 -translate-x-1/2 rounded-full border border-line-strong bg-raised px-4 py-2 text-sm font-semibold text-fg shadow-xl shadow-black/40 animate-fade-slide-up"
      style={{ bottom: "calc(env(safe-area-inset-bottom) + 1.5rem)" }}
    >
      {message}
    </div>
  );
}
