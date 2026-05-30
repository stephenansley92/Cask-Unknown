"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

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
  host_key: string;
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
  const [copyHint, setCopyHint] = useState("");

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

        if (userError) {
          setError(userError.message);
          setLoading(false);
          return;
        }

        if (!user) {
          router.push("/login?redirectTo=%2Fsessions");
          return;
        }

        const { data, error: sessionsError } = await supabase
          .from("sessions")
          .select("id,title,host_key,status,created_at")
          .eq("host_user_id", user.id)
          .order("created_at", { ascending: false });

        if (sessionsError) {
          setError(sessionsError.message);
          setLoading(false);
          return;
        }

        setAccountSessions(
          ((data || []) as SessionRow[]).map((row) => ({
            id: row.id,
            key: row.host_key,
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
      setCopyHint("Join link copied.");
      window.setTimeout(() => setCopyHint(""), 1800);
    } catch {
      setCopyHint("Could not copy link.");
      window.setTimeout(() => setCopyHint(""), 2500);
    }
  };

  return (
    <main className="min-h-screen bg-zinc-900 text-white p-4 sm:p-6">
      {copyHint ? (
        <div className="fixed bottom-6 left-1/2 z-40 -translate-x-1/2 rounded-full border border-zinc-700 bg-zinc-800 px-4 py-2 text-sm font-semibold text-zinc-100 shadow-lg">
          {copyHint}
        </div>
      ) : null}

      <div className="max-w-2xl mx-auto">
        <div className="bg-zinc-800 border border-zinc-700 rounded-3xl p-5 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-xs text-zinc-400">Cask Unknown</div>
              <div className="text-2xl font-extrabold tracking-tight mt-1">
                My Sessions
              </div>
              <div className="text-sm text-zinc-400 mt-1">
                Sessions hosted by your account, plus older sessions saved on this device.
              </div>
            </div>
            <button
              onClick={() => router.push("/")}
              className="rounded-2xl border border-zinc-700 px-4 py-2 text-sm font-semibold text-zinc-200 hover:bg-zinc-700"
            >
              Home
            </button>
          </div>

          {error ? (
            <div className="mt-4 rounded-2xl border border-red-800 bg-red-900/30 px-4 py-3 text-sm text-red-300">
              {error}
            </div>
          ) : null}

          {loading ? (
            <div className="mt-6 rounded-3xl border border-zinc-700 p-6 text-center text-sm text-zinc-400">
              Loading sessions...
            </div>
          ) : sessions.length === 0 ? (
            <div className="mt-6 rounded-3xl border border-zinc-700 p-6 text-center">
              <div className="text-zinc-400 text-sm">
                No hosted sessions found for this account.
              </div>
              <button
                onClick={() => router.push("/create")}
                className="mt-4 rounded-2xl bg-amber-500 px-5 py-3 text-sm font-semibold text-black hover:bg-amber-600 active:scale-95"
              >
                Create a Session
              </button>
            </div>
          ) : (
            <div className="mt-5 space-y-3">
              {sessions.map((session) => (
                <div
                  key={`${session.source}-${session.id}`}
                  className="rounded-2xl border border-zinc-700 bg-zinc-900 px-4 py-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="font-semibold truncate">{session.title}</div>
                        <span className="rounded-full border border-zinc-700 bg-zinc-800 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
                          {session.source === "account" ? "Account" : "This device"}
                        </span>
                      </div>
                      <div className="text-xs text-zinc-400 mt-1">
                        {formatDate(session.createdAt)}
                        {session.status ? ` - ${session.status}` : ""}
                      </div>
                    </div>
                    {session.source === "device" ? (
                      <button
                        onClick={() => removeDeviceSession(session.id)}
                        className="text-zinc-400 hover:text-red-400 active:scale-95 text-lg leading-none font-bold shrink-0"
                        aria-label="Forget device session"
                      >
                        x
                      </button>
                    ) : null}
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      onClick={() =>
                        router.push(
                          `/host/${session.id}?key=${encodeURIComponent(session.key)}`
                        )
                      }
                      className="rounded-xl bg-zinc-800 px-4 py-2 text-xs font-semibold text-white hover:bg-zinc-700 active:scale-95"
                    >
                      Host Dashboard
                    </button>
                    <button
                      onClick={() => router.push(`/reveal/${session.id}`)}
                      className="rounded-xl border border-amber-500/50 bg-amber-500/10 px-4 py-2 text-xs font-semibold text-amber-300 hover:bg-amber-500/20 active:scale-95"
                    >
                      Results
                    </button>
                    <button
                      onClick={() => copyJoinLink(session.id)}
                      className="rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-2 text-xs font-semibold text-zinc-200 hover:bg-zinc-800 active:scale-95"
                    >
                      Copy Join Link
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="mt-5">
            <button
              onClick={() => router.push("/create")}
              className="w-full rounded-2xl bg-amber-500 py-3 font-semibold text-black hover:bg-amber-600 active:scale-95"
            >
              + New Session
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
