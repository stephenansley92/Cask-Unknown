"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { GlassWater, Home, User, Users } from "lucide-react";
import { cx } from "./cx";

const TABS = [
  { href: "/", label: "Home", icon: Home, match: (p: string) => p === "/" },
  { href: "/sessions", label: "Sessions", icon: GlassWater, match: (p: string) => p.startsWith("/sessions") },
  { href: "/leaderboard", label: "Community", icon: Users, match: (p: string) => p.startsWith("/leaderboard") },
  { href: "/profile", label: "Profile", icon: User, match: (p: string) => p.startsWith("/profile") },
];

/**
 * Bottom navigation for the top-level screens. Focused flows (hosting,
 * scoring, reveal) deliberately don't render it. Pair with
 * `<PageShell bottomInset>` so content clears the bar.
 */
export function TabBar() {
  const pathname = usePathname() || "/";

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-canvas/90 backdrop-blur-md"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="mx-auto flex max-w-md">
        {TABS.map(({ href, label, icon: Icon, match }) => {
          const active = match(pathname);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cx(
                "flex flex-1 flex-col items-center gap-1 pb-2.5 pt-3 text-[11px] font-semibold",
                active ? "text-accent" : "text-fg-faint hover:text-fg-muted",
              )}
            >
              <Icon className="h-5 w-5" strokeWidth={active ? 2.25 : 1.75} />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
