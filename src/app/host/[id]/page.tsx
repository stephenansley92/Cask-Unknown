"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { QRCodeCanvas } from "qrcode.react";
import { ConnectionBanner } from "@/components/connection-banner";
import { ConfirmModal } from "@/components/confirm-modal";
import { errorMessage } from "@/lib/log";
import { getHostSession, setHostSessionStatus, unlockHostScores } from "@/lib/session-api";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Eye,
  Lock,
  Star,
  Trophy,
  Tv,
  Unlock,
  Users,
  Wine,
} from "lucide-react";
import { Button, buttonStyles } from "@/components/ui/button";
import { Card, Eyebrow } from "@/components/ui/card";
import { LoadingScreen, Wordmark } from "@/components/ui/brand";
import { Notice } from "@/components/ui/notice";
import { PageShell } from "@/components/ui/page";
import { StatusPill } from "@/components/ui/status-pill";
import { Toast, useToast } from "@/components/ui/toast";
import { cx } from "@/components/ui/cx";
import { GuessingCard } from "./guessing-card";

type SessionRow = {
  id: string;
  title: string;
  is_blind: boolean;
  status: string; // setup | scoring | reveal_ready | revealed | closed
  created_at?: string;
};

type PourRow = { id: string; session_id: string };
type ParticipantRow = { id: string; session_id: string };
type ScoreLockRow = {
  pour_id: string;
  participant_id: string;
  core_locked: boolean | null;
  final_locked: boolean | null;
};

export default function HostPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();

  const sessionId = params?.id;
  const hostKey = searchParams.get("key") || "";

  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<SessionRow | null>(null);
  const [error, setError] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [pendingAction, setPendingAction] = useState<{
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);
  const toast = useToast();

  // gating stats
  const [poursCount, setPoursCount] = useState(0);
  const [participantsCount, setParticipantsCount] = useState(0);
  const [expectedCount, setExpectedCount] = useState(0);
  const [coreLockedCount, setCoreLockedCount] = useState(0);
  const [finalLockedCount, setFinalLockedCount] = useState(0);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsReady, setStatsReady] = useState(false);

  const joinUrl = useMemo(() => {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/join/${sessionId}`;
  }, [sessionId]);

  const revealUrl = useMemo(() => {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/reveal/${sessionId}`;
  }, [sessionId]);

  const refreshStats = async () => {
    if (!sessionId) return;

    try {
      setStatsLoading(true);

      const authClient = createSupabaseBrowserClient();
      const { data: snapshot, error: snapshotError } = await getHostSession(
        authClient,
        sessionId,
        hostKey,
      );
      if (snapshotError || !snapshot) throw snapshotError || new Error("Host session not found.");

      const pours = snapshot.pours as PourRow[];
      const participants = snapshot.participants as ParticipantRow[];

      const expected = pours.length * participants.length;

      // Pull existing score locks
      const locks = snapshot.scores as ScoreLockRow[];

      // Build a quick lookup: `${participantId}__${pourId}` -> lock flags
      const lockMap: Record<string, { core: boolean; final: boolean }> = {};
      for (const r of locks) {
        const key = `${r.participant_id}__${r.pour_id}`;
        lockMap[key] = { core: !!r.core_locked, final: !!r.final_locked };
      }

      // Count locks across ALL expected combos (missing score row counts as not locked)
      let coreCount = 0;
      let finalCount = 0;

      for (const u of participants) {
        for (const p of pours) {
          const key = `${u.id}__${p.id}`;
          const row = lockMap[key];
          if (row?.core) coreCount += 1;
          if (row?.final) finalCount += 1;
        }
      }

      setPoursCount(pours.length);
      setParticipantsCount(participants.length);
      setExpectedCount(expected);
      setCoreLockedCount(coreCount);
      setFinalLockedCount(finalCount);
      setStatsReady(true);
    } catch (e: unknown) {
      // don't hard-fail the host page if stats fail
      console.warn("Stats refresh failed:", errorMessage(e));
    } finally {
      setStatsLoading(false);
    }
  };

  useEffect(() => {
    const run = async () => {
      try {
        setLoading(true);
        setError("");

        if (!sessionId) {
          setError("Missing session id.");
          setLoading(false);
          return;
        }
        const authClient = createSupabaseBrowserClient();
        const { data: snapshot, error } = await getHostSession(authClient, sessionId, hostKey);

        if (error || !snapshot) {
          setError(error?.message || "Host session not found.");
          setLoading(false);
          return;
        }

        const data = snapshot.session as SessionRow;
        setSession(data);
        setLoading(false);

        // Persist to localStorage so My Sessions page can list it
        if (typeof window !== "undefined") {
          const storageKey = "cask_unknown_host_sessions";
          let saved: { id: string; key: string; title: string; createdAt: string }[] = [];
          try { saved = JSON.parse(window.localStorage.getItem(storageKey) || "[]"); } catch {}
          if (!saved.find((s) => s.id === sessionId)) {
            saved.unshift({ id: sessionId, key: hostKey, title: (data as SessionRow).title, createdAt: (data as SessionRow).created_at || new Date().toISOString() });
            window.localStorage.setItem(storageKey, JSON.stringify(saved.slice(0, 30)));
          }
        }

        // initial stats
        await refreshStats();
      } catch (e: unknown) {
        setError(errorMessage(e));
        setLoading(false);
      }
    };

    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, hostKey]);

  // ✅ realtime: keep host stats updated (scores/participants/pours)
  useEffect(() => {
    if (!sessionId) return;

    // Coalesce bursts of change events (every taster autosaving fires one
    // per keystroke batch) into a single stats refresh per window instead of
    // three queries per event.
    let refreshTimer: number | null = null;
    const scheduleStatsRefresh = () => {
      if (refreshTimer) window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => {
        refreshTimer = null;
        void refreshStats();
      }, 400);
    };

    const channel = supabase
      .channel(`host-live-${sessionId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "sessions", filter: `id=eq.${sessionId}` },
        (payload) => {
          const newStatus = String(payload.new?.status || "");
          setSession((prev) => (prev ? { ...prev, status: newStatus } : prev));
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "scores", filter: `session_id=eq.${sessionId}` },
        scheduleStatsRefresh
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "participants", filter: `session_id=eq.${sessionId}` },
        scheduleStatsRefresh
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pours", filter: `session_id=eq.${sessionId}` },
        scheduleStatsRefresh
      )
      .subscribe();

    return () => {
      if (refreshTimer) window.clearTimeout(refreshTimer);
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.show(`${label} copied`);
    } catch {
      toast.show("Couldn't copy. Long-press the link to copy it.");
    }
  };

  const goPoursSetup = () => {
    router.push(`/host/${sessionId}/pours?key=${encodeURIComponent(hostKey)}`);
  };

  const goTastersSetup = () => {
    router.push(`/host/${sessionId}/tasters?key=${encodeURIComponent(hostKey)}`);
  };

  const doSetStatus = async (newStatus: string, after?: () => void) => {
    if (!sessionId || !session) return;

    try {
      setBusy(true);

      // Session updates are restricted to authenticated users by RLS, so use
      // the cookie-based auth client (the host signed in to create the session).
      // The plain anon client would be silently rejected (0 rows updated).
      const dbClient = createSupabaseBrowserClient();
      const { data: updated, error } = await setHostSessionStatus(
        dbClient,
        sessionId,
        newStatus,
        hostKey,
      );

      if (error) {
        setError(error.message);
        setBusy(false);
        return;
      }

      if (!updated) {
        setError(
          "Couldn't change status. Make sure you're signed in as the host account that created this session, then try again."
        );
        setBusy(false);
        return;
      }

      // Don't optimistically update — the realtime subscription will reflect the change.
      setBusy(false);
      after?.();
    } catch (e: unknown) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };

  const setStatus = (newStatus: string, confirmText: string, after?: () => void) => {
    setPendingAction({
      title:
        newStatus === "revealed"
          ? "Start the big reveal?"
          : newStatus === "reveal_ready"
            ? "Start the soft reveal?"
            : "Change status?",
      message: confirmText,
      onConfirm: () => {
        setPendingAction(null);
        doSetStatus(newStatus, after);
      },
    });
  };

  const doUnlockAllScores = async () => {
    if (!sessionId) return;

    try {
      setBusy(true);

      const dbClient = createSupabaseBrowserClient();
      const { error } = await unlockHostScores(dbClient, sessionId, hostKey);

      if (error) {
        setError(error.message);
        setBusy(false);
        return;
      }

      await refreshStats();
      setBusy(false);
    } catch (e: unknown) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };

  const unlockAllScores = () => {
    const statusNow = (session?.status || "").toLowerCase();
    if (statusNow === "revealed") {
      setError("Scores stay locked after the big reveal.");
      return;
    }

    setPendingAction({
      title: "Unlock every score?",
      message:
        "This clears the core and final locks on every scorecard so tasters can fix missed categories before the big reveal.",
      onConfirm: () => {
        setPendingAction(null);
        doUnlockAllScores();
      },
    });
  };

  if (loading) {
    return <LoadingScreen label="Loading host dashboard" />;
  }

  if (error && !session) {
    return (
      <PageShell center>
        <div className="w-full text-center">
          <Wordmark size="lg" />
          <Notice tone="danger" title="This host dashboard didn't open" className="mt-8 text-left">
            {error} Open it from your tastings while signed in as the host, or use the host link you got when
            you created the session.
          </Notice>
          <Link href="/sessions" className={buttonStyles({ variant: "secondary", size: "lg", block: true, className: "mt-4" })}>
            Your tastings
          </Link>
        </div>
      </PageShell>
    );
  }

  if (!session) return null;

  const status = (session.status || "").toLowerCase();
  const isRevealReady = status === "reveal_ready";
  const isRevealed = status === "revealed";

  const coreAllLocked = expectedCount > 0 && coreLockedCount === expectedCount;
  const finalAllLocked = expectedCount > 0 && finalLockedCount === expectedCount;

  const canSoftReveal = coreAllLocked && !isRevealReady && !isRevealed;
  const canBigReveal = finalAllLocked && !isRevealed;

  const needsSetup = poursCount === 0 || participantsCount === 0;
  const setupHint =
    poursCount === 0 && participantsCount === 0
      ? "Add pours and invite tasters first."
      : poursCount === 0
        ? "Add pours first."
        : "Waiting for tasters to join.";

  const softState: StepState = isRevealReady || isRevealed ? "done" : canSoftReveal ? "ready" : "blocked";
  const bigState: StepState = isRevealed ? "done" : canBigReveal ? "ready" : "blocked";

  return (
    <PageShell width="md">
      <ConnectionBanner />
      <ConfirmModal
        open={!!pendingAction}
        title={pendingAction?.title ?? ""}
        message={pendingAction?.message ?? ""}
        confirmLabel="Start it"
        cancelLabel="Not yet"
        onConfirm={pendingAction?.onConfirm ?? (() => setPendingAction(null))}
        onCancel={() => setPendingAction(null)}
      />
      <Toast message={toast.message} />

      <header className="flex items-center justify-between">
        <Link href="/" className={buttonStyles({ variant: "ghost", size: "sm", className: "-ml-3" })}>
          <ChevronLeft className="h-4 w-4" /> Home
        </Link>
        <Wordmark />
      </header>

      <div className="mt-6">
        <div className="flex items-center gap-2">
          <Eyebrow>Host dashboard</Eyebrow>
          <StatusPill status={session.status} />
        </div>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight sm:text-4xl">{session.title}</h1>
        <p className="mt-1 text-sm text-fg-muted">
          {session.is_blind
            ? "Blind tasting. Bottle names stay hidden until the big reveal."
            : "Open tasting. Bottle names are visible to everyone."}
        </p>
      </div>

      {error ? (
        <Notice tone="danger" onDismiss={() => setError("")} className="mt-4">
          {error}
        </Notice>
      ) : null}

      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <Eyebrow>Invite tasters</Eyebrow>
          <div className="mt-4 flex items-center gap-4">
            {/* QR codes need a light quiet zone to scan reliably */}
            <div className="shrink-0 rounded-2xl bg-white p-2.5">
              <QRCodeCanvas value={joinUrl} size={112} />
            </div>
            <p className="text-sm text-fg-muted">
              Everyone scans this with their phone camera. No account needed.
            </p>
          </div>
          <div className="mt-4 flex gap-2">
            <input
              readOnly
              value={joinUrl}
              aria-label="Join link"
              onFocus={(e) => e.currentTarget.select()}
              className="h-11 min-w-0 flex-1 rounded-2xl border border-line bg-sunken px-3 text-sm text-fg-muted focus:border-accent focus:outline-none"
            />
            <Button variant="secondary" onClick={() => copy(joinUrl, "Join link")}>
              <Copy className="h-4 w-4" /> Copy
            </Button>
          </div>
          <Link
            href={`/join/${sessionId}`}
            className={buttonStyles({ variant: "ghost", block: true, className: "mt-2" })}
          >
            <Star className="h-4 w-4" /> Score as a taster yourself
          </Link>
        </Card>

        <Card>
          <Eyebrow>Progress</Eyebrow>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-sunken px-4 py-3">
              <div className="flex items-center gap-1.5 text-xs text-fg-faint">
                <Users className="h-3.5 w-3.5" /> Tasters
              </div>
              <div className="mt-1 font-display text-2xl font-semibold tabular-nums">{participantsCount}</div>
            </div>
            <div className="rounded-2xl bg-sunken px-4 py-3">
              <div className="flex items-center gap-1.5 text-xs text-fg-faint">
                <Wine className="h-3.5 w-3.5" /> Pours
              </div>
              <div className="mt-1 font-display text-2xl font-semibold tabular-nums">{poursCount}</div>
            </div>
          </div>

          <div className="mt-4 space-y-3" aria-busy={statsLoading && !statsReady}>
            {statsReady ? (
              <>
                <ProgressRow
                  icon={<Lock className="h-3.5 w-3.5" />}
                  label="Core scores locked"
                  done={coreLockedCount}
                  total={expectedCount}
                  tone="success"
                />
                <ProgressRow
                  icon={<Trophy className="h-3.5 w-3.5" />}
                  label="Final scores locked"
                  done={finalLockedCount}
                  total={expectedCount}
                  tone="accent"
                />
              </>
            ) : (
              <div className="h-16 animate-pulse rounded-2xl bg-sunken" />
            )}
          </div>
        </Card>
      </div>

      <Card className="mt-4" padded={false}>
        <div className="px-5 pt-5">
          <Eyebrow>Set up</Eyebrow>
        </div>
        <div className="mt-2">
          <button
            type="button"
            onClick={goPoursSetup}
            className="flex w-full items-center gap-3 border-b border-line px-5 py-4 text-left hover:bg-raised"
          >
            <Wine className="h-5 w-5 shrink-0 text-accent" />
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">Pours and bottles</span>
              <span className="block text-xs text-fg-muted">
                {poursCount ? `${poursCount} pours` : "No pours yet"} · bottle names stay hidden until the reveal
              </span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-fg-faint" />
          </button>
          <button
            type="button"
            onClick={goTastersSetup}
            className="flex w-full items-center gap-3 rounded-b-3xl px-5 py-4 text-left hover:bg-raised"
          >
            <Users className="h-5 w-5 shrink-0 text-accent" />
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">Tasters</span>
              <span className="block text-xs text-fg-muted">
                {participantsCount ? `${participantsCount} joined` : "Nobody has joined yet"}
              </span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-fg-faint" />
          </button>
        </div>
      </Card>

      {sessionId ? (
        <GuessingCard
          sessionId={sessionId}
          hostKey={hostKey}
          isBlind={session.is_blind}
          isRevealed={isRevealed}
          onSaved={toast.show}
        />
      ) : null}

      <Card className="mt-4">
        <Eyebrow>Run the reveal</Eyebrow>

        <ol className="mt-4 space-y-4">
          <StepRow
            index={1}
            title="Soft reveal"
            body="Opens packaging and value scoring on everyone's phone. Bottle names stay hidden."
            state={softState}
            hint={
              softState === "blocked"
                ? needsSetup
                  ? setupHint
                  : `Waiting for core scores: ${coreLockedCount} of ${expectedCount} locked.`
                : softState === "done"
                  ? "Soft reveal is live."
                  : undefined
            }
          >
            {softState !== "done" ? (
              <Button
                variant={softState === "ready" ? "primary" : "secondary"}
                disabled={busy || !canSoftReveal}
                onClick={() =>
                  setStatus(
                    "reveal_ready",
                    "Tasters can score packaging and value on their phones. Bottle names stay hidden until the big reveal."
                  )
                }
              >
                <Eye className="h-4 w-4" /> {busy ? "Working…" : "Start soft reveal"}
              </Button>
            ) : null}
          </StepRow>

          <StepRow
            index={2}
            title="Big reveal"
            body="Unmasks the bottles and crowns a winner on the reveal screen."
            state={bigState}
            hint={
              bigState === "blocked"
                ? needsSetup
                  ? setupHint
                  : `Waiting for final scores: ${finalLockedCount} of ${expectedCount} locked. Tasters tap “Lock final scores”.`
                : undefined
            }
          >
            {isRevealed ? (
              <Link href={`/reveal/${sessionId}`} className={buttonStyles({ variant: "primary" })}>
                <Trophy className="h-4 w-4" /> Open the reveal
              </Link>
            ) : (
              <Button
                variant={bigState === "ready" ? "primary" : "secondary"}
                disabled={busy || !canBigReveal}
                className={cx(bigState === "ready" && !busy && "animate-reveal-pulse")}
                onClick={() =>
                  setStatus(
                    "revealed",
                    "Bottle names and winners appear on the reveal screen, and scores can't change after this.",
                    () => router.push(`/reveal/${sessionId}`)
                  )
                }
              >
                <Trophy className="h-4 w-4" /> {busy ? "Revealing…" : "Start big reveal"}
              </Button>
            )}
          </StepRow>
        </ol>

        <div className="mt-5 flex flex-wrap gap-2 border-t border-line pt-4">
          <Link
            href={`/host/${sessionId}/tv?key=${encodeURIComponent(hostKey)}`}
            className={buttonStyles({ variant: "secondary", size: "sm" })}
          >
            <Tv className="h-4 w-4" /> TV mode
          </Link>
          <Button variant="ghost" size="sm" onClick={() => copy(revealUrl, "Reveal link")}>
            <Copy className="h-4 w-4" /> Copy reveal link
          </Button>
          <Button variant="ghost" size="sm" onClick={unlockAllScores} disabled={busy || isRevealed}>
            <Unlock className="h-4 w-4" /> Unlock every score
          </Button>
        </div>
        <p className="mt-2 text-xs text-fg-faint">
          Put TV mode on a TV or tablet: it shows the join code and everyone&apos;s progress, then switches to the reveal when you start it.
        </p>
      </Card>

      <p className="mt-6 text-center text-xs text-fg-faint">This dashboard link is private to the host.</p>
    </PageShell>
  );
}

type StepState = "done" | "ready" | "blocked";

function StepRow({
  index,
  title,
  body,
  state,
  hint,
  children,
}: {
  index: number;
  title: string;
  body: string;
  state: StepState;
  hint?: string;
  children?: ReactNode;
}) {
  return (
    <li className="flex gap-4">
      <span
        className={cx(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border font-display text-sm font-semibold",
          state === "done"
            ? "border-success/40 bg-success-soft text-success"
            : state === "ready"
              ? "border-accent bg-accent text-on-accent"
              : "border-line-strong text-fg-faint",
        )}
      >
        {state === "done" ? <Check className="h-4 w-4" /> : index}
      </span>
      <div className="min-w-0 flex-1">
        <div className="font-semibold">{title}</div>
        <p className="text-sm text-fg-muted">{body}</p>
        {hint ? (
          <p className={cx("mt-1 text-xs", state === "done" ? "text-success" : "text-fg-faint")}>{hint}</p>
        ) : null}
        {children ? <div className="mt-3">{children}</div> : null}
      </div>
    </li>
  );
}

function ProgressRow({
  icon,
  label,
  done,
  total,
  tone,
}: {
  icon: ReactNode;
  label: string;
  done: number;
  total: number;
  tone: "success" | "accent";
}) {
  const pct = total > 0 ? (done / total) * 100 : 0;
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-xs">
        <span className="flex items-center gap-1.5 text-fg-muted">
          {icon} {label}
        </span>
        <span className="font-semibold tabular-nums text-fg">
          {done}/{total}
        </span>
      </div>
      <div
        className="h-2 w-full overflow-hidden rounded-full bg-sunken"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={done}
      >
        <div
          className={cx("h-full rounded-full transition-all duration-500", tone === "success" ? "bg-success" : "bg-accent")}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
