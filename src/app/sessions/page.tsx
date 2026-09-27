"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { isAuthSessionMissingError } from "@supabase/supabase-js";
import { Link2, Plus, Smartphone, Trophy, X } from "lucide-react";
import { listHostedSessions } from "@/lib/session-api";
import { Button, buttonStyles } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { LoadingDots, Wordmark } from "@/components/ui/brand";
import { Notice } from "@/components/ui/notice";
import { PageShell } from "@/components/ui/page";
import { StatusPill } from "@/components/ui/status-pill";
import { TabBar } from "@/components/ui/tab-bar";
import { Toast, useToast } from "@/components/ui/toast";

type SavedSession = {
  id: string;
  key: string;
  title: string;
  createdAt: string;
  status?: string;
  source: "account" | "device";
};

type SessionRow = {
  id: string;
  title: string;
  status: string | null;
  created_at: string | null;
};

function formatDate(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "Unknown date";
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function readDeviceSessions(): SavedSession[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem("cask_unknown_host_sessions");
    const rows = JSON.parse(raw || "[]") as {
      id?: string;
      key?: string;
      title?: string;
      createdAt?: string;
    }[];

    return rows
      .filter((row) => row.id && row.key)
      .map((row) => ({
        id: row.id || "",
        key: row.key || "",
        title: row.title || "Untitled Session",
        createdAt: row.createdAt || new Date().toISOString(),
        source: "device" as const,
      }));
  } catch {
    return [];
  }
}

export default function SessionsPage() {
  const router = useRouter();
  const [accountSessions, setAccountSessions] = useState<SavedSession[]>([]);
  const [deviceSessions, setDeviceSessions] = useState<SavedSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const toast = useToast();

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError("");
      setDeviceSessions(readDeviceSessions());

      try {
        const supabase = createSupabaseBrowserClient();
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError && !isAuthSessionMissingError(userError)) {
          setError(userError.message);
          setLoading(false);
          return;
        }

        if (!user) {
          router.push("/login?redirectTo=%2Fsessions");
          return;
        }

        const { data, error: sessionsError } = await listHostedSessions(supabase);

        if (sessionsError) {
          setError(sessionsError.message);
          setLoading(false);
          return;
        }

        setAccountSessions(
          ((data || []) as SessionRow[]).map((row) => ({
            id: row.id,
            key: "",
            title: row.title || "Untitled Session",
            createdAt: row.created_at || new Date().toISOString(),
            status: row.status || "setup",
            source: "account",
          }))
        );
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Could not load sessions.");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [router]);

  const sessions = useMemo(() => {
    const accountIds = new Set(accountSessions.map((session) => session.id));
    return [
      ...accountSessions,
      ...deviceSessions.filter((session) => !accountIds.has(session.id)),
    ];
  }, [accountSessions, deviceSessions]);

  const removeDeviceSession = (id: string) => {
    const next = deviceSessions.filter((session) => session.id !== id);
    setDeviceSessions(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("cask_unknown_host_sessions", JSON.stringify(next));
    }
  };

  const copyJoinLink = async (id: string) => {
    try {
      const url = `${window.location.origin}/join/${id}`;
      await navigator.clipboard.writeText(url);
      toast.show("Join link copied.");
    } catch {
      toast.show("Could not copy link.");
    }
  };

  return (
    <PageShell bottomInset>
      <TabBar />
      <Toast message={toast.message} />

      <div className="animate-fade-slide-in">
        <header className="flex items-center justify-between">
          <Wordmark />
          <Link href="/create" className={buttonStyles({ variant: "primary", size: "sm" })}>
            <Plus className="h-4 w-4" /> New tasting
          </Link>
        </header>

        <h1 className="mt-8 font-display text-3xl font-semibold tracking-tight">Your tastings</h1>
        <p className="mt-1 text-sm text-fg-muted">
          Sessions you&apos;ve hosted, plus older ones saved on this device.
        </p>

        {error ? (
          <Notice tone="danger" className="mt-4">
            {error}
          </Notice>
        ) : null}

        {loading ? (
          <div className="mt-12 flex justify-center">
            <LoadingDots label="Loading sessions" />
          </div>
        ) : sessions.length === 0 ? (
          <Card className="mt-6 text-center">
            <div className="font-semibold">No tastings yet</div>
            <p className="mt-1 text-sm text-fg-muted">Host your first blind flight and it will show up here.</p>
            <Link href="/create" className={buttonStyles({ variant: "primary", size: "md", className: "mt-4" })}>
              <Plus className="h-4 w-4" /> Host a tasting
            </Link>
          </Card>
        ) : (
          <ul className="mt-6 space-y-3">
            {sessions.map((session) => (
              <li key={`${session.source}-${session.id}`}>
                <Card padded={false} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate font-semibold">{session.title}</div>
                      <div className="mt-0.5 flex items-center gap-1.5 text-xs text-fg-faint">
                        {formatDate(session.createdAt)}
                        {session.source === "device" ? (
                          <>
                            <span aria-hidden>·</span>
                            <Smartphone className="h-3 w-3" /> This device
                          </>
                        ) : null}
                      </div>
                    </div>
                    {session.source === "device" ? (
                      <button
                        type="button"
                        onClick={() => removeDeviceSession(session.id)}
                        className="-mr-1 -mt-1 shrink-0 rounded-lg p-1.5 text-fg-faint hover:bg-raised hover:text-danger"
                        aria-label="Forget device session"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    ) : (
                      <StatusPill status={session.status} />
                    )}
                  </div>

                  <div className="mt-4 flex gap-2">
                    <Link
                      href={`/host/${session.id}?key=${encodeURIComponent(session.key)}`}
                      className={buttonStyles({ variant: "secondary", size: "sm", className: "flex-1" })}
                    >
                      Dashboard
                    </Link>
                    <Link
                      href={`/reveal/${session.id}`}
                      className={buttonStyles({ variant: "secondary", size: "sm", className: "flex-1" })}
                    >
                      <Trophy className="h-3.5 w-3.5 text-accent" /> Results
                    </Link>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyJoinLink(session.id)}
                      aria-label={`Copy join link for ${session.title}`}
                    >
                      <Link2 className="h-4 w-4" />
                    </Button>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>
    </PageShell>
  );
}
