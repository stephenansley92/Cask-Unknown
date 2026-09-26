"use client";

import { useEffect, useState } from "react";
import { CloudOff } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

export function ConnectionBanner() {
  const [disconnected, setDisconnected] = useState(false);

  useEffect(() => {
    const channel = supabase.channel("__conn_monitor__").subscribe((status) => {
      if (status === "SUBSCRIBED") {
        setDisconnected(false);
      } else if (
        status === "CHANNEL_ERROR" ||
        status === "TIMED_OUT" ||
        status === "CLOSED"
      ) {
        setDisconnected(true);
      }
    });

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  if (!disconnected) return null;

  return (
    <div
      role="alert"
      className="fixed inset-x-0 top-0 z-50 flex items-center justify-center gap-2 bg-danger px-4 py-2 text-center text-sm font-semibold text-canvas shadow-lg animate-fade-slide-down"
      style={{ paddingTop: "max(0.5rem, env(safe-area-inset-top))" }}
    >
      <CloudOff className="h-4 w-4 shrink-0" />
      Connection lost. Scores may not sync — reload if this persists.
    </div>
  );
}
