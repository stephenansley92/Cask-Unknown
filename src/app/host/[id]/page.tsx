"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { QRCodeCanvas } from "qrcode.react";

type SessionRow = {
  id: string;
  title: string;
  host_key: string;
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

  // gating stats
  const [poursCount, setPoursCount] = useState(0);
  const [participantsCount, setParticipantsCount] = useState(0);
  const [expectedCount, setExpectedCount] = useState(0);
  const [coreLockedCount, setCoreLockedCount] = useState(0);
  const [finalLockedCount, setFinalLockedCount] = useState(0);
  const [statsLoading, setStatsLoading] = useState(false);

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

      const { data: poursData, error: poursErr } = await supabase
        .from("pours")
        .select("id,session_id")
        .eq("session_id", sessionId);

      if (poursErr) throw poursErr;

      const { data: partsData, error: partsErr } = await supabase
        .from("participants")
        .select("id,session_id")
        .eq("session_id", sessionId);

      if (partsErr) throw partsErr;

      const pours = (poursData || []) as PourRow[];
      const participants = (partsData || []) as ParticipantRow[];

      const expected = pours.length * participants.length;

      // Pull existing score locks
      const { data: locksData, error: locksErr } = await supabase
        .from("scores")
        .select("pour_id,participant_id,core_locked,final_locked")
        .eq("session_id", sessionId);

      if (locksErr) throw locksErr;

      const locks = (locksData || []) as ScoreLockRow[];

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
    } catch (e: any) {
      // don't hard-fail the host page if stats fail
      console.warn("Stats refresh failed:", e?.message || e);
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
        if (!hostKey) {
          setError("Missing host key (this link is host-only).");
          setLoading(false);
          return;
        }

        const { data, error } = await supabase
          .from("sessions")
          .select("id,title,host_key,is_blind,status,created_at")
          .eq("id", sessionId)
          .single();

        if (error) {
          setError(error.message);
          setLoading(false);
          return;
        }

        if (!data || (data as any).host_key !== hostKey) {
          setError("Host key mismatch. This link is not authorized.");
          setLoading(false);
          return;
        }

        setSession(data as SessionRow);
        setLoading(false);

        // initial stats
        await refreshStats();
      } catch (e: any) {
        setError(e?.message || "Unknown error.");
        setLoading(false);
      }
    };

    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, hostKey]);

  // ✅ realtime: keep host stats updated (scores/participants/pours)
  useEffect(() => {
    if (!sessionId) return;

    const channel = supabase
      .channel(`host-live-${sessionId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "sessions", filter: `id=eq.${sessionId}` },
        (payload: any) => {
          const newStatus = (payload?.new?.status || "") as string;
          setSession((prev) => (prev ? { ...prev, status: newStatus } : prev));
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "scores", filter: `session_id=eq.${sessionId}` },
        async () => {
          await refreshStats();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "participants", filter: `session_id=eq.${sessionId}` },
        async () => {
          await refreshStats();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pours", filter: `session_id=eq.${sessionId}` },
        async () => {
          await refreshStats();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      alert(`${label} copied!`);
    } catch {
      alert("Could not copy. You can manually copy the link.");
    }
  };

  const goPoursSetup = () => {
    router.push(`/host/${sessionId}/pours?key=${encodeURIComponent(hostKey)}`);
  };

  const goTastersSetup = () => {
    router.push(`/host/${sessionId}/tasters?key=${encodeURIComponent(hostKey)}`);
  };

  const setStatus = async (newStatus: string, confirmText: string, after?: () => void) => {
    if (!sessionId || !session) return;

    const ok = confirm(confirmText);
    if (!ok) return;

    try {
      setBusy(true);

      const { error } = await supabase.from("sessions").update({ status: newStatus }).eq("id", sessionId);

      if (error) {
        alert(error.message);
        setBusy(false);
        return;
      }

      setSession({ ...session, status: newStatus });
      setBusy(false);
      after?.();
    } catch (e: any) {
      alert(e?.message || "Unknown error.");
      setBusy(false);
    }
  };

  const unlockAllScores = async () => {
    if (!sessionId) return;

    const statusNow = (session?.status || "").toLowerCase();
    if (statusNow === "revealed") {
      alert("Scores stay locked after BIG REVEAL.");
      return;
    }

    const ok = confirm(
      "Unlock all scores for this session?\n\nThis clears CORE and FINAL locks for every saved score so tasters can finish or fix missed categories before BIG REVEAL."
    );
    if (!ok) return;

    try {
      setBusy(true);

      const { error } = await supabase
        .from("scores")
        .update({
          core_locked: false,
          core_locked_at: null,
          final_locked: false,
          final_locked_at: null,
        })
        .eq("session_id", sessionId);

      if (error) {
        alert(error.message);
        setBusy(false);
        return;
      }

      await refreshStats();
      setBusy(false);
      alert("All score locks cleared.");
    } catch (e: any) {
      alert(e?.message || "Unknown error.");
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-zinc-900 text-white flex items-center justify-center p-6">
        <div className="text-zinc-300">Loading host dashboard…</div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="min-h-screen bg-zinc-900 text-white flex items-center justify-center p-6">
        <div className="max-w-lg w-full bg-zinc-800 border border-zinc-700 rounded-2xl p-6">
          <h1 className="text-xl font-bold text-amber-400 mb-2">Host Error</h1>
          <p className="text-zinc-300">{error}</p>
          <p className="text-zinc-500 mt-4 text-sm">Tip: Use the host link created right after session creation.</p>
        </div>
      </main>
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

  return (
    <main className="min-h-screen bg-zinc-900 text-white p-6">
      <div className="max-w-2xl mx-auto">
        <div className="bg-zinc-800 border border-zinc-700 rounded-3xl p-6 md:p-8 shadow-lg">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-3xl font-extrabold text-amber-400">{session.title}</h1>
              <p className="text-zinc-400 mt-1">
                Host Dashboard • Status: <span className="text-zinc-200 font-semibold">{session.status}</span>
              </p>
              <p className="text-zinc-500 text-sm mt-1">Blind mode: {session.is_blind ? "ON" : "OFF"}</p>

              <div className="mt-3 text-xs text-zinc-400">
                {statsLoading ? (
                  <span>Checking locks…</span>
                ) : (
                  <span>
                    Core Locked:{" "}
                    <span className="text-zinc-100 font-semibold tabular-nums">
                      {coreLockedCount}/{expectedCount || 0}
                    </span>
                    {" • "}
                    Final Locked:{" "}
                    <span className="text-zinc-100 font-semibold tabular-nums">
                      {finalLockedCount}/{expectedCount || 0}
                    </span>
                    {" • "}
                    {participantsCount} tasters • {poursCount} pours
                  </span>
                )}
              </div>
            </div>

            <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-3">
              <QRCodeCanvas value={joinUrl} size={120} />
            </div>
          </div>

          {/* Join link */}
          <div className="mt-6 bg-zinc-900 border border-zinc-700 rounded-2xl p-4">
            <div className="text-sm text-zinc-400 mb-2">Join link for friends</div>
            <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center">
              <input
                readOnly
                value={joinUrl}
                className="flex-1 bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-zinc-200"
              />
              <button
                onClick={() => copy(joinUrl, "Join link")}
                className="bg-amber-500 hover:bg-amber-600 text-black font-semibold px-5 py-3 rounded-xl"
              >
                Copy
              </button>
            </div>
            <div className="text-xs text-zinc-500 mt-2">Have them scan the QR code or open the link.</div>
          </div>

          <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Bottle info */}
            <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-5">
              <div className="text-zinc-300 font-semibold">Step 1 — Reveal Prep</div>
              <div className="text-zinc-500 text-sm mt-1">
                Enter bottle name/proof (when you know them). Names stay hidden until BIG REVEAL.
              </div>
              <button
                onClick={goPoursSetup}
                className="mt-4 w-full bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-white font-semibold px-4 py-3 rounded-xl"
              >
                Manage Pours (Bottle Info)
              </button>
              <button
                onClick={goTastersSetup}
                className="mt-3 w-full bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-white font-semibold px-4 py-3 rounded-xl"
              >
                Manage Tasters
              </button>
              <div className="text-xs text-zinc-500 mt-2">
                You can edit bottle info during Soft Reveal too — it stays hidden until BIG REVEAL.
              </div>
            </div>

            {/* Reveal controls */}
            <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-5">
              <div className="text-zinc-300 font-semibold">Step 2 — Reveal Controls</div>
              <div className="text-zinc-500 text-sm mt-1">
                Soft Reveal opens Packaging/Value scoring. BIG REVEAL shows names + winners.
              </div>

              <div className="mt-4 grid grid-cols-1 gap-2">
                <button
                  disabled={busy || !canSoftReveal}
                  onClick={() =>
                    setStatus(
                      "reveal_ready",
                      "SOFT REVEAL now?\n\nThis unlocks Packaging + Value scoring on phones.\nBottle names stay hidden until BIG REVEAL."
                    )
                  }
                  className={[
                    "w-full font-semibold px-4 py-3 rounded-xl border",
                    isRevealReady || isRevealed
                      ? "bg-emerald-600/20 border-emerald-700 text-emerald-200 cursor-not-allowed"
                      : canSoftReveal
                      ? "bg-zinc-800 hover:bg-zinc-700 border-zinc-700 text-white"
                      : "bg-zinc-900 border-zinc-800 text-zinc-500 cursor-not-allowed",
                  ].join(" ")}
                >
                  {isRevealed
                    ? "Soft Reveal (Done)"
                    : isRevealReady
                    ? "Soft Reveal Active"
                    : busy
                    ? "Working…"
                    : "SOFT REVEAL (Unlock Packaging + Value)"}
                </button>

                {!coreAllLocked ? (
                  <div className="text-xs text-zinc-500">
                    Soft Reveal is locked until everyone locks core scores ({coreLockedCount}/{expectedCount || 0}).
                  </div>
                ) : null}

                <button
                  disabled={busy || (!canBigReveal && !isRevealed)}
                  onClick={() => {
                    if (isRevealed) {
                      router.push(`/reveal/${sessionId}`);
                      return;
                    }

                    setStatus(
                      "revealed",
                      "BIG REVEAL now?\n\nThis will show bottle names and final winners on the reveal screen.",
                      () => router.push(`/reveal/${sessionId}`)
                    );
                  }}
                  className={[
                    "w-full font-extrabold px-4 py-3 rounded-xl",
                    isRevealed
                      ? "bg-amber-500 hover:bg-amber-600 text-black"
                      : canBigReveal
                      ? "bg-amber-500 hover:bg-amber-600 text-black"
                      : "bg-zinc-900 border border-zinc-800 text-zinc-500 cursor-not-allowed",
                  ].join(" ")}
                >
                  {isRevealed ? "BIG REVEAL COMPLETE" : busy ? "Revealing…" : "BIG REVEAL"}
                </button>

                {!finalAllLocked ? (
                  <div className="text-xs text-zinc-500">
                    BIG REVEAL is locked until everyone locks FINAL scores ({finalLockedCount}/{expectedCount || 0}).
                    <br />
                    Tell them to tap <span className="text-zinc-200 font-semibold">“Lock Final Scores”</span>.
                  </div>
                ) : null}

                <button
                  onClick={unlockAllScores}
                  disabled={busy || isRevealed}
                  className={[
                    "w-full px-4 py-3 rounded-xl border font-semibold",
                    busy || isRevealed
                      ? "bg-zinc-900 border-zinc-800 text-zinc-500 cursor-not-allowed"
                      : "bg-zinc-800 hover:bg-zinc-700 border-zinc-700 text-white",
                  ].join(" ")}
                >
                  {busy ? "Working..." : "Unlock All Scores"}
                </button>

                <div className="text-xs text-zinc-500">
                  Clears CORE and FINAL locks across the session so people can fix missed categories before BIG
                  REVEAL.
                </div>

                <button
                  onClick={() => copy(revealUrl, "Reveal link")}
                  className="w-full px-4 py-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-white font-semibold"
                >
                  Copy Reveal Link
                </button>
              </div>

              <div className="text-xs text-zinc-500 mt-2">
                Tip: open the reveal link on a TV/iPad — it will wait until BIG REVEAL.
              </div>
            </div>
          </div>

          <div className="mt-6 text-center text-zinc-500 text-sm">Cask Unknown • Host link is private (key-protected)</div>
        </div>
      </div>
    </main>
  );
}
