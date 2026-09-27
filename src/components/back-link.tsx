"use client";

import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { buttonStyles } from "@/components/ui/button";

/** "Back" that returns to wherever the visitor came from, or `fallback` on a fresh tab. */
export function BackLink({ fallback = "/", label = "Back" }: { fallback?: string; label?: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => (window.history.length > 1 ? router.back() : router.push(fallback))}
      className={buttonStyles({ variant: "ghost", size: "sm", className: "-ml-3" })}
    >
      <ChevronLeft className="h-4 w-4" /> {label}
    </button>
  );
}
