"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

function makeKey(len = 24) {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => (b % 36).toString(36))
    .join("");
}

function defaultTitle() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `Blind Flight - ${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

export default function CreatePage() {
  const router = useRouter();

  const [title, setTitle] = useState(defaultTitle());
  const [isBlind, setIsBlind] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [createdId, setCreatedId] = useState<string>("");

  const hostKey = useMemo(() => makeKey(28), []);

  const createSession = async () => {
    try {
      setBusy(true);
      setError("");
      setCreatedId("");

      const cleanTitle = title.trim();
      if (!cleanTitle) {
        setError("Please enter a session title.");
        setBusy(false);
        return;
      }

      const { data, error: insErr } = await supabase
        .from("sessions")
        .insert([
          {
            title: cleanTitle,
            host_key: hostKey,
            is_blind: isBlind,
            status: "setup",
          },
        ])
        .select("id,host_key")
        .single();

      if (insErr) {
        setError(insErr.message);
        setBusy(false);
        return;
      }

      const sessionId = data.id as string;
      const key = data.host_key as string;

      console.log("[CREATE] New session:", sessionId);
      setCreatedId(sessionId);

      router.push(`/host/${sessionId}?key=${encodeURIComponent(key)}`);
    } catch (e: any) {
      setError(e?.message || "Unknown error.");
      setBusy(false);
    }
  };

  return (
    <main className="min-h-screen bg-zinc-900 text-white p-6 flex items-center justify-center">
      <div className="w-full max-w-lg bg-zinc-800 border border-zinc-700 rounded-3xl p-6 md:p-8 shadow-lg">
        <div className="text-sm text-zinc-400">Cask Unknown</div>
        <h1 className="text-3xl font-extrabold text-amber-400 mt-2">
          Create a Session
        </h1>

        <div className="mt-6 space-y-4">
          <div>
            <div className="text-sm text-zinc-300 mb-2">Session Title</div>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Super Bowl Blind Flight"
              className="w-full bg-zinc-900 border border-zinc-700 rounded-2xl px-4 py-3 text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-amber-500/30"
            />
          </div>

          <div className="flex items-center justify-between bg-zinc-900 border border-zinc-700 rounded-2xl px-4 py-3">
            <div>
              <div className="font-semibold text-zinc-200">Blind mode</div>
              <div className="text-xs text-zinc-500">
                Keeps bottle names hidden until Reveal
              </div>
            </div>

            <button
              onClick={() => setIsBlind((v) => !v)}
              className={[
                "px-4 py-2 rounded-xl font-semibold border",
                isBlind
                  ? "bg-amber-500 text-black border-amber-500"
                  : "bg-zinc-800 text-zinc-200 border-zinc-700",
              ].join(" ")}
            >
              {isBlind ? "ON" : "OFF"}
            </button>
          </div>

          {createdId ? (
            <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-200 rounded-2xl px-4 py-3 text-sm">
              Created session: <span className="font-mono">{createdId}</span>
            </div>
          ) : null}

          {error ? (
            <div className="bg-red-500/10 border border-red-500/30 text-red-200 rounded-2xl px-4 py-3 text-sm">
              {error}
            </div>
          ) : null}

          <button
            onClick={createSession}
            disabled={busy}
            className={[
              "w-full rounded-2xl px-5 py-3 font-semibold",
              busy
                ? "bg-amber-500/60 text-black cursor-not-allowed"
                : "bg-amber-500 hover:bg-amber-600 text-black",
            ].join(" ")}
          >
            {busy ? "Creating…" : "Create Session"}
          </button>

          <div className="text-xs text-zinc-500 text-center">
            After creating, you’ll go to the private host dashboard link.
          </div>
        </div>
      </div>
    </main>
  );
}
