"use client";

import { useEffect } from "react";

type WakeLockSentinel = {
  release: () => Promise<void>;
  addEventListener: (type: "release", listener: () => void) => void;
};

type WakeLockNavigator = Navigator & {
  wakeLock?: {
    request: (type: "screen") => Promise<WakeLockSentinel>;
  };
};

export function useWakeLock(enabled: boolean) {
  useEffect(() => {
    if (!enabled || typeof navigator === "undefined") return;

    const wakeNavigator = navigator as WakeLockNavigator;
    if (!wakeNavigator.wakeLock) return;

    let sentinel: WakeLockSentinel | null = null;
    let cancelled = false;

    const requestLock = async () => {
      try {
        sentinel = await wakeNavigator.wakeLock?.request("screen") || null;
        sentinel?.addEventListener("release", () => {
          sentinel = null;
        });
      } catch {
        sentinel = null;
      }
    };

    const handleVisibilityChange = () => {
      if (!cancelled && document.visibilityState === "visible" && !sentinel) {
        void requestLock();
      }
    };

    void requestLock();
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      void sentinel?.release().catch(() => {});
      sentinel = null;
    };
  }, [enabled]);
}
