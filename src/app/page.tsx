"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { isAuthSessionMissingError } from "@supabase/supabase-js";
import {
  ArrowRight,
  ChevronRight,
  GlassWater,
  ScanLine,
  ShieldCheck,
  Star,
} from "lucide-react";
import { listHostedSessions } from "@/lib/session-api";
import { errorMessage, logEvent, newCorrelationId, userFacingError } from "@/lib/log";
import { Button, buttonStyles } from "@/components/ui/button";
import { Card, Eyebrow } from "@/components/ui/card";
import { LoadingScreen, Wordmark } from "@/components/ui/brand";
import { Notice } from "@/components/ui/notice";
import { PageShell } from "@/components/ui/page";
import { StatusPill } from "@/components/ui/status-pill";
import { TabBar } from "@/components/ui/tab-bar";

const OWNER_EMAIL = "stephen.ansley92@gmail.com";
const RECENT_SESSION_LIMIT = 3;

type HomeView =
  | "loading"
  | "signed_out"
  | "profile_setup"
  | "signed_in"
  | "error";

type UserProfileRow = {
  user_id: string;
  display_name: string | null;
};

type RecentSession = {
  id: string;
  title: string;
  status: string | null;
  created_at: string | null;
};

function greeting() {
  const hour = new Date().getHours();
  if (hour < 5) return "Late pour";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function formatShortDate(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function sessionHref(session: RecentSession) {
  return session.status === "revealed" ? `/reveal/${session.id}` : `/host/${session.id}`;
}

function JoinForm({ onJoin }: { onJoin: (raw: string) => void }) {
  const [value, setValue] = useState("");

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (value.trim()) onJoin(value);
  };

  return (
    <form onSubmit={submit} className="flex gap-2 animate-fade-slide-in">
      <label htmlFor="join-input" className="sr-only">
        Join link or session ID
      </label>
      <input
        id="join-input"
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Paste join link or session ID"
        className="h-11 min-w-0 flex-1 rounded-2xl border border-line bg-sunken px-4 text-sm text-fg placeholder:text-fg-faint focus:border-accent focus:outline-none"
      />
      <Button type="submit" variant="primary" disabled={!value.trim()} aria-label="Join session">
        <ArrowRight className="h-4 w-4" />
      </Button>
    </form>
  );
}

const HOW_IT_WORKS = [
  { step: "1", title: "Pour", body: "The host sets out numbered glasses. Nobody knows what's in them." },
  { step: "2", title: "Score", body: "Everyone scores each pour on their phone across ten categories." },
  { step: "3", title: "Reveal", body: "Bottles are unmasked from last place to first. Crown a winner." },
];

export default function Home() {
  const router = useRouter();
  const [view, setView] = useState<HomeView>("loading");
  const [error, setError] = useState("");
  const [isOwner, setIsOwner] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [recentSessions, setRecentSessions] = useState<RecentSession[]>([]);
  const [showJoin, setShowJoin] = useState(false);

  const handleJoin = (raw: string) => {
    const trimmed = raw.trim();
    const match = trimmed.match(/\/join\/([^/?#\s]+)/);
    const id = match ? match[1] : trimmed;
    router.push(`/join/${encodeURIComponent(id)}`);
  };

  useEffect(() => {
    let cancelled = false;

    const loadUser = async () => {
      try {
        const authClient = createSupabaseBrowserClient();
        const {
          data: { user },
          error: userError,
        } = await authClient.auth.getUser();

        if (userError && !isAuthSessionMissingError(userError)) {
          throw userError;
        }

        if (!user) {
          if (!cancelled) {
            setIsOwner(false);
            setView("signed_out");
          }
          return;
        }

        const normalizedEmail = (user.email || "").trim().toLowerCase();

        if (!cancelled) {
          setIsOwner(normalizedEmail === OWNER_EMAIL);
        }

        const [{ data: profileData, error: profileError }, { data: sessionsData, error: sessionsError }] =
          await Promise.all([
            authClient
              .from("user_profiles")
              .select("user_id,display_name")
              .eq("user_id", user.id)
              .maybeSingle(),
            listHostedSessions(authClient),
          ]);

        if (profileError) {
          throw profileError;
        }

        // Recent sessions are a convenience; never block the home screen on them.
        if (sessionsError) {
          logEvent("warn", "home.recent_sessions_failed", { message: sessionsError.message });
        }

        const name = (profileData as UserProfileRow | null)?.display_name?.trim() || "";

        if (!cancelled) {
          setDisplayName(name);
          setRecentSessions(((sessionsData || []) as RecentSession[]).slice(0, RECENT_SESSION_LIMIT));
          setView(name ? "signed_in" : "profile_setup");
        }
      } catch (loadError: unknown) {
        const ref = newCorrelationId();
        logEvent("error", "home.load_failed", { ref, message: errorMessage(loadError) });
        if (!cancelled) {
          setError(userFacingError("We couldn't load your account.", ref));
          setView("error");
        }
      }
    };

    loadUser();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (view !== "profile_setup") return;
    router.replace("/profile/setup");
  }, [router, view]);

  if (view === "loading" || view === "profile_setup") {
    return <LoadingScreen />;
  }

  if (view === "error") {
    return (
      <PageShell center>
        <div className="w-full animate-fade-slide-in text-center">
          <Wordmark size="lg" />
          <Notice tone="danger" className="mt-8 text-left">
            {error}
          </Notice>
          <div className="mt-4 flex flex-col gap-2">
            <Button variant="primary" size="lg" block onClick={() => window.location.reload()}>
              Try again
            </Button>
            <Link href="/login?redirectTo=%2F" className={buttonStyles({ variant: "ghost", size: "lg", block: true })}>
              Sign in again
            </Link>
          </div>
        </div>
      </PageShell>
    );
  }

  if (view === "signed_out") {
    return (
      <PageShell center>
        <div className="w-full animate-fade-slide-in">
          <div className="text-center">
            <Wordmark size="lg" />
            <p className="mt-3 text-fg-muted">Blind whiskey tasting with friends.</p>
          </div>

          <ol className="mt-10 space-y-3">
            {HOW_IT_WORKS.map((item) => (
              <li key={item.step} className="flex gap-4">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-accent/40 font-display text-sm font-semibold text-accent">
                  {item.step}
                </span>
                <div>
                  <div className="font-semibold text-fg">{item.title}</div>
                  <div className="text-sm text-fg-muted">{item.body}</div>
                </div>
              </li>
            ))}
          </ol>

          <div className="mt-10 flex flex-col gap-2">
            <Link href="/login?redirectTo=%2F" className={buttonStyles({ variant: "primary", size: "lg", block: true })}>
              Sign in or create account
            </Link>
            {showJoin ? (
              <JoinForm onJoin={handleJoin} />
            ) : (
              <Button variant="secondary" size="lg" block onClick={() => setShowJoin(true)}>
                <ScanLine className="h-4 w-4" /> Join a tasting as a guest
              </Button>
            )}
            <Link href="/leaderboard" className={buttonStyles({ variant: "ghost", size: "md", block: true })}>
              Browse the community
            </Link>
          </div>
        </div>
      </PageShell>
    );
  }

  const initial = displayName.charAt(0).toUpperCase() || "?";

  return (
    <PageShell bottomInset>
      <TabBar />
      <div className="animate-fade-slide-in">
        <header className="flex items-center justify-between">
          <Wordmark />
          <Link
            href="/profile"
            aria-label="Your profile"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-line bg-surface font-display font-semibold text-fg hover:border-line-strong"
          >
            {initial}
          </Link>
        </header>

        <h1 className="mt-8 font-display text-3xl font-semibold tracking-tight">
          {greeting()}, {displayName}
        </h1>
        <p className="mt-1 text-fg-muted">What are we pouring tonight?</p>

        <Link
          href="/create"
          className="group mt-6 flex items-center gap-4 rounded-3xl bg-accent p-5 text-on-accent hover:bg-accent-hover"
        >
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-on-accent/10">
            <GlassWater className="h-6 w-6" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-lg font-bold">Host a blind tasting</span>
            <span className="block text-sm opacity-75">Numbered pours, QR invites, big reveal</span>
          </span>
          <ChevronRight className="h-5 w-5 shrink-0 transition-transform group-hover:translate-x-0.5" />
        </Link>

        <div className="mt-3 grid grid-cols-2 gap-3">
          <Link href="/rate/new" className="rounded-3xl border border-line bg-surface p-4 hover:border-line-strong">
            <Star className="h-5 w-5 text-accent" />
            <div className="mt-3 font-semibold">Rate a pour</div>
            <div className="text-xs text-fg-muted">Log a solo tasting</div>
          </Link>
          <button
            type="button"
            onClick={() => setShowJoin((v) => !v)}
            aria-expanded={showJoin}
            className="rounded-3xl border border-line bg-surface p-4 text-left hover:border-line-strong"
          >
            <ScanLine className="h-5 w-5 text-accent" />
            <div className="mt-3 font-semibold">Join a tasting</div>
            <div className="text-xs text-fg-muted">Paste a link or ID</div>
          </button>
        </div>

        {showJoin ? (
          <div className="mt-3">
            <JoinForm onJoin={handleJoin} />
            <p className="mt-2 px-1 text-xs text-fg-faint">Or scan the QR code on the host&apos;s screen.</p>
          </div>
        ) : null}

        <section className="mt-8">
          <div className="flex items-baseline justify-between">
            <Eyebrow>Your tastings</Eyebrow>
            {recentSessions.length ? (
              <Link href="/sessions" className="text-xs font-semibold text-fg-muted hover:text-fg">
                See all
              </Link>
            ) : null}
          </div>

          {recentSessions.length ? (
            <ul className="mt-3 overflow-hidden rounded-3xl border border-line bg-surface">
              {recentSessions.map((session) => (
                <li key={session.id} className="border-b border-line last:border-b-0">
                  <Link
                    href={sessionHref(session)}
                    className="flex items-center justify-between gap-3 px-4 py-3.5 hover:bg-raised"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">{session.title || "Untitled tasting"}</span>
                      <span className="block text-xs text-fg-faint">{formatShortDate(session.created_at)}</span>
                    </span>
                    <StatusPill status={session.status} />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <Card className="mt-3 text-center">
              <div className="font-semibold">No tastings yet</div>
              <p className="mt-1 text-sm text-fg-muted">
                Sessions you host will show up here so you can jump back in.
              </p>
            </Card>
          )}
        </section>

        {isOwner ? (
          <Link
            href="/admin/testers"
            className={buttonStyles({ variant: "ghost", size: "sm", className: "mt-6" })}
          >
            <ShieldCheck className="h-4 w-4" /> Admin
          </Link>
        ) : null}
      </div>
    </PageShell>
  );
}
