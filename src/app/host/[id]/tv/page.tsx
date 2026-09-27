"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { QRCodeCanvas } from "qrcode.react";
import { Check, ChevronLeft, Lock } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { ConnectionBanner } from "@/components/connection-banner";
import { buttonStyles } from "@/components/ui/button";
import { LoadingScreen, Wordmark } from "@/components/ui/brand";
import { Notice } from "@/components/ui/notice";
import { PageShell } from "@/components/ui/page";
import { StatusPill } from "@/components/ui/status-pill";
import { cx } from "@/components/ui/cx";
import { useWakeLock } from "@/lib/use-wake-lock";
import { getHostSession, type HostSessionSnapshot } from "@/lib/session-api";
import { errorMessage } from "@/lib/log";

type TasterProgress = {
  id: string;
  name: string;
  started: number;
  core: number;
  final: number;
};

const STAGE_COPY: Record<string, { title: string; body: string }> = {
  setup: { title: "Grab a glass", body: "Scan the code to join. The host is setting out the pours." },
  scoring: { title: "Tasting in progress", body: "Score each pour on your phone, then lock your core scores." },
  reveal_ready: { title: "Soft reveal", body: "Score packaging and value, then lock your final scores." },
  revealed: { title: "The big reveal", body: "Opening the results…" },
  closed: { title: "Tasting closed", body: "Thanks for tasting." },
};

/**
 * Host-only screen for a TV or tablet during the tasting: the join code in
 * big type and every taster's progress, updating live. It hands off to the
 * reveal screen the moment the host starts the big reveal.
 */
export default function HostTvPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const sessionId = params?.id;
  const hostKey = searchParams.get("key") || "";

  const [snapshot, setSnapshot] = useState<HostSessionSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const loadRef = useRef<() => Promise<void>>(async () => {});

  useWakeLock(Boolean(snapshot));

  const joinUrl = useMemo(() => {
    if (typeof window === "undefined" || !sessionId) return "";
    return `${window.location.origin}/join/${sessionId}`;
  }, [sessionId]);

  useEffect(() => {
    loadRef.current = async () => {
      if (!sessionId) return;
      try {
        const { data, error: loadError } = await getHostSession(createSupabaseBrowserClient(), sessionId, hostKey);
        if (loadError || !data) throw loadError || new Error("Host session not found.");
        setSnapshot(data);
        setError("");
      } catch (e: unknown) {
        setError(errorMessage(e));
      } finally {
        setLoading(false);
      }
    };
  });

  useEffect(() => {
    void loadRef.current();
  }, [sessionId, hostKey]);

  useEffect(() => {
    if (!sessionId) return;
    let timer: number | null = null;
    const schedule = () => {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        timer = null;
        void loadRef.current();
      }, 400);
    };
    const channel = supabase
      .channel(`host-tv-${sessionId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "sessions", filter: `id=eq.${sessionId}` }, schedule)
      .on("postgres_changes", { event: "*", schema: "public", table: "scores", filter: `session_id=eq.${sessionId}` }, schedule)
      .on("postgres_changes", { event: "*", schema: "public", table: "participants", filter: `session_id=eq.${sessionId}` }, schedule)
      .on("postgres_changes", { event: "*", schema: "public", table: "pours", filter: `session_id=eq.${sessionId}` }, schedule)
      .subscribe();
    // Realtime can miss events on flaky venue Wi-Fi; a slow poll backs it up.
    const poll = window.setInterval(() => void loadRef.current(), 15000);
    return () => {
      if (timer) window.clearTimeout(timer);
      window.clearInterval(poll);
      supabase.removeChannel(channel);
    };
  }, [sessionId]);

  const status = (snapshot?.session.status || "setup").toLowerCase();

  useEffect(() => {
    if (status === "revealed" && sessionId) router.replace(`/reveal/${sessionId}`);
  }, [router, sessionId, status]);

  const tasters = useMemo<TasterProgress[]>(() => {
    if (!snapshot) return [];
    return snapshot.participants.map((p) => {
      const mine = snapshot.scores.filter((s) => s.participant_id === p.id);
      return {
        id: p.id,
        name: p.display_name,
        started: mine.length,
        core: mine.filter((s) => s.core_locked).length,
        final: mine.filter((s) => s.final_locked).length,
      };
    });
  }, [snapshot]);

  if (loading) return <LoadingScreen label="Opening TV mode" />;

  if (error || !snapshot) {
    return (
      <PageShell center>
        <div className="w-full text-center">
          <Wordmark size="lg" />
          <Notice tone="danger" title="TV mode didn't load" className="mt-8 text-left">
            {error || "Host session not found."} Open TV mode from the host dashboard while signed in as the host.
          </Notice>
        </div>
      </PageShell>
    );
  }

  const pourCount = snapshot.pours.length;
  const stage = STAGE_COPY[status] ?? STAGE_COPY.setup;
  const lockKey: "core" | "final" = status === "reveal_ready" ? "final" : "core";
  const doneCount = tasters.filter((t) => pourCount > 0 && t[lockKey] >= pourCount).length;

  return (
    <main
      className="flex min-h-dvh flex-col bg-canvas px-5 pb-6 text-fg sm:px-10"
      style={{ paddingTop: "max(1.25rem, env(safe-area-inset-top))" }}
    >
      <ConnectionBanner />

      <header className="flex items-center justify-between gap-4">
        <Link
          href={`/host/${sessionId}?key=${encodeURIComponent(hostKey)}`}
          className={buttonStyles({ variant: "ghost", size: "sm", className: "-ml-3" })}
        >
          <ChevronLeft className="h-4 w-4" /> Dashboard
        </Link>
        <Wordmark />
      </header>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <StatusPill status={status} />
        <span className="text-sm text-fg-faint">
          {tasters.length} {tasters.length === 1 ? "taster" : "tasters"} · {pourCount} {pourCount === 1 ? "pour" : "pours"}
        </span>
      </div>
      <h1 className="mt-2 font-display text-4xl font-semibold tracking-tight sm:text-6xl">{snapshot.session.title}</h1>

      <div className="mt-8 grid flex-1 grid-cols-1 gap-8 lg:grid-cols-[auto_1fr]">
        {/* Join code, sized to scan from across a room */}
        <section className="flex flex-col items-center gap-4 lg:items-start">
          <div className="rounded-3xl bg-white p-4">
            <QRCodeCanvas value={joinUrl} size={260} />
          </div>
          <div className="text-center lg:text-left">
            <div className="font-display text-2xl font-semibold">Scan to join</div>
            <div className="mt-1 break-all text-sm text-fg-faint">{joinUrl.replace(/^https?:\/\//, "")}</div>
          </div>
        </section>

        <section className="min-w-0">
          <div className="rounded-3xl border border-line bg-surface p-5 sm:p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-display text-2xl font-semibold sm:text-3xl">{stage.title}</h2>
              {tasters.length && (status === "scoring" || status === "reveal_ready") ? (
                <span className="text-sm font-semibold text-fg-muted">
                  {doneCount} of {tasters.length} {lockKey === "final" ? "final-locked" : "locked in"}
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-fg-muted">{stage.body}</p>
          </div>

          {tasters.length ? (
            <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {tasters.map((t) => {
                const locked = t[lockKey];
                const done = pourCount > 0 && locked >= pourCount;
                const pct = pourCount ? (locked / pourCount) * 100 : 0;
                return (
                  <li
                    key={t.id}
                    className={cx(
                      "rounded-2xl border p-4 transition-colors",
                      done ? "border-success/40 bg-success-soft" : "border-line bg-surface",
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={cx(
                          "flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-display text-lg font-semibold",
                          done ? "bg-success text-canvas" : "bg-accent-soft text-accent",
                        )}
                      >
                        {done ? <Check className="h-5 w-5" /> : t.name.charAt(0).toUpperCase()}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-lg font-semibold">{t.name}</div>
                        <div className="flex items-center gap-1 text-xs text-fg-faint">
                          {done ? (
                            lockKey === "final" ? "Ready for the reveal" : "All pours locked"
                          ) : (
                            <>
                              <Lock className="h-3 w-3" /> {locked} of {pourCount} locked
                              {t.started > locked ? ` · ${t.started - locked} in progress` : ""}
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-sunken">
                      <div
                        className={cx("h-full rounded-full transition-all duration-500", done ? "bg-success" : "bg-accent")}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="mt-6 text-lg text-fg-muted">Waiting for the first taster to scan in…</p>
          )}
        </section>
      </div>
    </main>
  );
}
