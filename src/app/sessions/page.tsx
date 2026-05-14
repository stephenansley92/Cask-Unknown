"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type SavedSession = {
  id: string;
  key: string;
  title: string;
  createdAt: string;
};

function formatDate(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "Unknown date";
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export default function SessionsPage() {
  const router = useRouter();
  const [sessions, setSessions] = useState<SavedSession[]>([]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem("cask_unknown_host_sessions");
      setSessions(JSON.parse(raw || "[]"));
    } catch {
      setSessions([]);
    }
  }, []);

  const remove = (id: string) => {
    const next = sessions.filter((s) => s.id !== id);
    setSessions(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("cask_unknown_host_sessions", JSON.stringify(next));
    }
  };

  return (
    <main className="min-h-screen bg-zinc-900 text-white p-4 sm:p-6">
      <div className="max-w-lg mx-auto">
        <div className="bg-zinc-800 border border-zinc-700 rounded-3xl p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs text-zinc-400">Cask Unknown</div>
              <div className="text-2xl font-extrabold tracking-tight mt-1">My Sessions</div>
              <div className="text-sm text-zinc-400 mt-1">Sessions you've hosted on this device.</div>
            </div>
            <button
              onClick={() => router.push("/")}
              className="rounded-2xl border border-zinc-200 px-4 py-2 text-sm font-semibold text-zinc-200 hover:bg-zinc-50"
            >
              Home
            </button>
          </div>

          {sessions.length === 0 ? (
            <div className="mt-6 rounded-3xl border border-zinc-200 p-6 text-center">
              <div className="text-zinc-400 text-sm">No sessions yet on this device.</div>
              <button
                onClick={() => router.push("/create")}
                className="mt-4 rounded-2xl bg-amber-500 hover:bg-amber-600 active:scale-95 text-black px-5 py-3 text-sm font-semibold"
              >
                Create a Session
              </button>
            </div>
          ) : (
            <div className="mt-5 space-y-3">
              {sessions.map((s) => (
                <div
                  key={s.id}
                  className="rounded-2xl border border-zinc-700 bg-zinc-900 px-4 py-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-semibold truncate">{s.title}</div>
                      <div className="text-xs text-zinc-400 mt-0.5">{formatDate(s.createdAt)}</div>
                    </div>
                    <button
                      onClick={() => remove(s.id)}
                      className="text-zinc-400 hover:text-red-500 active:scale-95 text-lg leading-none font-bold shrink-0"
                    >
                      ×
                    </button>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      onClick={() => router.push(`/host/${s.id}?key=${encodeURIComponent(s.key)}`)}
                      className="rounded-xl bg-zinc-900 hover:bg-zinc-800 active:scale-95 text-white px-4 py-2 text-xs font-semibold"
                    >
                      Host Dashboard
                    </button>
                    <button
                      onClick={() => router.push(`/reveal/${s.id}`)}
                      className="rounded-xl border border-amber-500/50 bg-amber-500/10 hover:bg-amber-500/20 active:scale-95 text-amber-700 px-4 py-2 text-xs font-semibold"
                    >
                      Reveal Screen
                    </button>
                    <button
                      onClick={() => {
                        const url = `${window.location.origin}/join/${s.id}`;
                        navigator.clipboard.writeText(url).catch(() => {});
                      }}
                      className="rounded-xl border border-zinc-200 bg-white hover:bg-zinc-50 active:scale-95 text-zinc-200 px-4 py-2 text-xs font-semibold"
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
              className="w-full rounded-2xl bg-amber-500 hover:bg-amber-600 active:scale-95 text-black py-3 font-semibold"
            >
              + New Session
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
