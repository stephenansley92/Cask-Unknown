"use client";

import { useEffect, useState } from "react";
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
    <div className="fixed top-0 left-0 right-0 z-50 bg-red-600 text-white text-center text-sm py-2 px-4 font-semibold shadow-lg animate-fade-slide-down">
      Connection lost — scores may not sync. Reload if this persists.
    </div>
  );
}
