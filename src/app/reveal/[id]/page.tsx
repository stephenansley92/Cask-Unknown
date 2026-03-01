"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type SessionRow = {
  id: string;
  title: string;
  is_blind: boolean;
  status: string;
};

type PourRow = {
  id: string;
  session_id: string;
  code: string;
  bottle_name: string | null;
  sort_order: number;
};

type ParticipantRow = {
  id: string;
  session_id: string;
  display_name: string;
};

type ScoreRow = {
  id: string;
  session_id: string;
  pour_id: string;
  participant_id: string;

  nose: number;
  flavor: number;
  mouthfeel: number;
  complexity: number;
  balance: number;
  finish: number;
  uniqueness: number;
  drinkability: number;
  packaging: number;
  value: number;
  total: number;
  notes?: string | null;
};

const CATEGORY = [
  { key: "nose", label: "Nose", max: 10 },
  { key: "flavor", label: "Flavor", max: 20 },
  { key: "mouthfeel", label: "Mouthfeel", max: 10 },
  { key: "complexity", label: "Complexity", max: 10 },
  { key: "balance", label: "Balance", max: 10 },
  { key: "finish", label: "Finish", max: 10 },
  { key: "uniqueness", label: "Uniqueness", max: 10 },
  { key: "drinkability", label: "Drinkability", max: 10 },
  { key: "packaging", label: "Packaging", max: 5 },
  { key: "value", label: "Value", max: 5 },
] as const;

function avg(nums: number[]) {
  if (!nums.length) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function clamp01(n: number) {
  if (!Number.isFinite(n)) return 0;
  return n;
}

function ratio(value: number, max: number) {
  if (max <= 0) return 0;
  const r = value / max;
  return Math.max(0, Math.min(1, r));
}

function isPerfect(value: number, max: number) {
  return Math.abs(value - max) < 1e-9;
}

/**
 * Color system (NO YELLOW):
 * - red / orange / teal / emerald based on ratio
 * - color applied to TEXT ONLY (cards stay dark)
 * - perfect score pops emerald
 *
 * Returns Tailwind class strings (no custom colors required).
 */
function scoreColor(value: number, max: number) {
  const r = ratio(value, max);
  const perfect = isPerfect(value, max);

  if (perfect) {
    return {
      border: "border-zinc-800",
      bg: "bg-transparent",
      text: "text-emerald-200",
      glow: "drop-shadow-[0_0_6px_rgba(52,211,153,0.45)]",
      chip: "bg-emerald-500/15 border border-emerald-400/50 text-emerald-100",
    };
  }

  // 0–0.29 red
  if (r < 0.3) {
    return {
      border: "border-zinc-800",
      bg: "bg-transparent",
      text: "text-red-300",
      glow: "drop-shadow-[0_0_4px_rgba(239,68,68,0.35)]",
      chip: "bg-red-500/12 border border-red-500/30 text-red-100",
    };
  }

  // 0.30–0.49 orange
  if (r < 0.5) {
    return {
      border: "border-zinc-800",
      bg: "bg-transparent",
      text: "text-orange-300",
      glow: "drop-shadow-[0_0_4px_rgba(249,115,22,0.35)]",
      chip: "bg-orange-500/12 border border-orange-500/30 text-orange-100",
    };
  }

  // 0.50–0.69 teal (replaces yellow)
  if (r < 0.7) {
    return {
      border: "border-zinc-800",
      bg: "bg-transparent",
      text: "text-teal-300",
      glow: "drop-shadow-[0_0_4px_rgba(45,212,191,0.35)]",
      chip: "bg-teal-500/12 border border-teal-500/30 text-teal-100",
    };
  }

  // 0.70+ emerald
  return {
    border: "border-zinc-800",
    bg: "bg-transparent",
    text: "text-emerald-500",
    glow: "drop-shadow-[0_0_4px_rgba(52,211,153,0.35)]",
    chip: "bg-emerald-500/12 border border-emerald-500/30 text-emerald-100",
  };
}

function chipClass(opts: { kind: "best" | "least" | "neutral"; value?: number; max?: number }) {
  const base = "text-xs font-semibold px-3 py-1 rounded-full border backdrop-blur-sm";

  // Perfect uses scoreColor chip
  if (
    typeof opts.value === "number" &&
    typeof opts.max === "number" &&
    isPerfect(opts.value, opts.max)
  ) {
    const c = scoreColor(opts.value, opts.max);
    return [base, c.chip].join(" ");
  }

  // Best / Least are fixed (readability)
  if (opts.kind === "best") {
    return [base, "bg-emerald-500/12 border-emerald-500/30 text-emerald-100"].join(" ");
  }
  if (opts.kind === "least") {
    return [base, "bg-red-500/12 border-red-500/30 text-red-100"].join(" ");
  }

  return [base, "bg-zinc-900/60 border-zinc-800 text-zinc-100"].join(" ");
}

type RankMeta = {
  rank: number;
  tied: boolean;
  size: number;
};

function sameScore(a: number, b: number) {
  return Math.abs(a - b) < 1e-9;
}

function formatOrdinal(n: number) {
  const mod10 = n % 10;
  const mod100 = n % 100;

  if (mod10 === 1 && mod100 !== 11) return `${n}st`;
  if (mod10 === 2 && mod100 !== 12) return `${n}nd`;
  if (mod10 === 3 && mod100 !== 13) return `${n}rd`;
  return `${n}th`;
}

function buildRankMeta(rows: { id: string; value: number }[]) {
  const meta: Record<string, RankMeta> = {};

  let i = 0;
  while (i < rows.length) {
    let j = i + 1;
    while (j < rows.length && sameScore(rows[j].value, rows[i].value)) {
      j += 1;
    }

    const rank = i + 1;
    const size = j - i;

    for (let k = i; k < j; k++) {
      meta[rows[k].id] = {
        rank,
        tied: size > 1,
        size,
      };
    }

    i = j;
  }

  return meta;
}

function formatRankLabel(rank: RankMeta | null | undefined) {
  if (!rank) return "-";
  return rank.tied ? `Tied for ${formatOrdinal(rank.rank)}` : formatOrdinal(rank.rank);
}

export default function RevealPage() {
  const params = useParams<{ id: string }>();
  const sessionId = params?.id;

  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<SessionRow | null>(null);
  const [pours, setPours] = useState<PourRow[]>([]);
  const [participants, setParticipants] = useState<ParticipantRow[]>([]);
  const [scores, setScores] = useState<ScoreRow[]>([]);
  const [error, setError] = useState("");

  // Cinematic mode: step through from LAST → FIRST, then final screen
  const [cinematicStep, setCinematicStep] = useState(0);

  const loadAll = async (id: string) => {
    const { data: sess, error: sessErr } = await supabase
      .from("sessions")
      .select("id,title,is_blind,status")
      .eq("id", id)
      .single();
    if (sessErr) throw sessErr;

    const { data: poursData, error: poursErr } = await supabase
      .from("pours")
      .select("id,session_id,code,bottle_name,sort_order")
      .eq("session_id", id)
      .order("sort_order", { ascending: true });
    if (poursErr) throw poursErr;

    const { data: partData, error: partErr } = await supabase
      .from("participants")
      .select("id,session_id,display_name")
      .eq("session_id", id)
      .order("created_at", { ascending: true });
    if (partErr) throw partErr;

    const { data: scoreData, error: scoreErr } = await supabase
      .from("scores")
      .select(
        "id,session_id,pour_id,participant_id,nose,flavor,mouthfeel,complexity,balance,finish,uniqueness,drinkability,packaging,value,total,notes"
      )
      .eq("session_id", id);
    if (scoreErr) throw scoreErr;

    setSession(sess as SessionRow);
    setPours((poursData || []) as PourRow[]);
    setParticipants((partData || []) as ParticipantRow[]);
    setScores((scoreData || []) as ScoreRow[]);
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

        await loadAll(sessionId);
        setLoading(false);
      } catch (e: any) {
        setError(e?.message || "Unknown error.");
        setLoading(false);
      }
    };

    run();
  }, [sessionId]);

  // ✅ realtime subscriptions (TV updates instantly)
  useEffect(() => {
    if (!sessionId) return;

    const channel = supabase
      .channel(`reveal-live-${sessionId}`)
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
          try {
            const { data, error: scoreErr } = await supabase
              .from("scores")
               .select(
                  "id,session_id,pour_id,participant_id,nose,flavor,mouthfeel,complexity,balance,finish,uniqueness,drinkability,packaging,value,total,notes"
                )
              .eq("session_id", sessionId);

            if (!scoreErr) setScores((data || []) as ScoreRow[]);
          } catch {
            // ignore
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pours", filter: `session_id=eq.${sessionId}` },
        async () => {
          try {
            const { data, error: poursErr } = await supabase
              .from("pours")
              .select("id,session_id,code,bottle_name,sort_order")
              .eq("session_id", sessionId)
              .order("sort_order", { ascending: true });

            if (!poursErr) setPours((data || []) as PourRow[]);
          } catch {
            // ignore
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [sessionId]);

  const status = (session?.status || "").toLowerCase();
  const isRevealed = status === "revealed";
  const isRevealReady = status === "reveal_ready";

  const displayPourName = (p: PourRow) => {
    // Before BIG REVEAL, keep it anonymous (even during reveal_ready)
    if (!session?.is_blind) return p.bottle_name || `Pour ${p.code}`;
    if (!isRevealed) return `Pour ${p.code}`;
    return p.bottle_name || `Pour ${p.code}`;
  };

  // ---------- Stats ----------
  const pourStats = useMemo(() => {
    const byPour: Record<
      string,
      { pour: PourRow; avgTotal: number; avgByCat: Record<string, number>; count: number }
    > = {};

    for (const p of pours) {
      byPour[p.id] = { pour: p, avgTotal: 0, avgByCat: {}, count: 0 };
    }

    for (const p of pours) {
      const s = scores.filter((x) => x.pour_id === p.id);
      byPour[p.id].count = s.length;
      byPour[p.id].avgTotal = avg(s.map((x) => clamp01(Number(x.total ?? 0))));

      for (const c of CATEGORY) {
        byPour[p.id].avgByCat[c.key] = avg(s.map((x: any) => clamp01(Number(x[c.key] ?? 0))));
      }
    }

    // High → low
    return Object.values(byPour).sort((a, b) => b.avgTotal - a.avgTotal);
  }, [pours, scores]);

  const overallWinner = useMemo(() => pourStats[0] || null, [pourStats]);

  const pourRankMeta = useMemo(
    () => buildRankMeta(pourStats.map((ps) => ({ id: ps.pour.id, value: ps.avgTotal }))),
    [pourStats]
  );

  const categoryWinners = useMemo(() => {
    // Best (highest avg) per category across pours
    const winners: { label: string; pour: PourRow | null; value: number; max: number }[] = [];

    for (const c of CATEGORY) {
      let best: { pour: PourRow | null; value: number } = { pour: null, value: -Infinity };
      for (const ps of pourStats) {
        const v = clamp01(ps.avgByCat[c.key] ?? 0);
        if (v > best.value) best = { pour: ps.pour, value: v };
      }
      winners.push({ label: c.label, pour: best.pour, value: best.value, max: c.max });
    }

    return winners;
  }, [pourStats]);

  const perUserRankings = useMemo(() => {
    // For each user: rank pours by their TOTAL (high → low)
    // Also expose best/least and per-category best/worst (by that user's score)
    type CatKey = (typeof CATEGORY)[number]["key"];

    const out: Record<
      string,
      {
        participant: ParticipantRow;
        ranking: { pour: PourRow; total: number; byCat: Record<string, number> }[];
        best?: { pour: PourRow; total: number };
        least?: { pour: PourRow; total: number };
        catBest: Record<string, { pour: PourRow; value: number; max: number }>;
        catWorst: Record<string, { pour: PourRow; value: number; max: number }>;
      }
    > = {};

    const pourById = new Map(pours.map((p) => [p.id, p]));
    for (const u of participants) {
      const userScores = scores.filter((s) => s.participant_id === u.id);

      // Build one row per pour, if score exists
      const rows: { pour: PourRow; total: number; byCat: Record<string, number> }[] = [];
      for (const s of userScores) {
        const p = pourById.get(s.pour_id);
        if (!p) continue;

        const byCat: Record<string, number> = {};
        for (const c of CATEGORY) byCat[c.key] = clamp01(Number((s as any)[c.key] ?? 0));
        rows.push({ pour: p, total: clamp01(Number(s.total ?? 0)), byCat });
      }

      // Sort high → low
      rows.sort((a, b) => b.total - a.total);

      const best = rows[0] ? { pour: rows[0].pour, total: rows[0].total } : undefined;
      const least = rows.length
        ? { pour: rows[rows.length - 1].pour, total: rows[rows.length - 1].total }
        : undefined;

      const catBest: Record<string, { pour: PourRow; value: number; max: number }> = {};
      const catWorst: Record<string, { pour: PourRow; value: number; max: number }> = {};

      for (const c of CATEGORY) {
        const key = c.key as CatKey;

        let bestRow: { pour: PourRow; value: number } | null = null;
        let worstRow: { pour: PourRow; value: number } | null = null;

        for (const r of rows) {
          const v = clamp01(r.byCat[key] ?? 0);
          if (!bestRow || v > bestRow.value) bestRow = { pour: r.pour, value: v };
          if (!worstRow || v < worstRow.value) worstRow = { pour: r.pour, value: v };
        }

        if (bestRow) catBest[key] = { pour: bestRow.pour, value: bestRow.value, max: c.max };
        if (worstRow) catWorst[key] = { pour: worstRow.pour, value: worstRow.value, max: c.max };
      }

      out[u.id] = { participant: u, ranking: rows, best, least, catBest, catWorst };
    }

    return out;
  }, [participants, scores, pours]);

  const perUserRankMeta = useMemo(() => {
    const out: Record<string, Record<string, RankMeta>> = {};

    for (const u of participants) {
      const rows = perUserRankings[u.id]?.ranking || [];
      out[u.id] = buildRankMeta(rows.map((r) => ({ id: r.pour.id, value: r.total })));
    }

    return out;
  }, [participants, perUserRankings]);

  // Cinematic ordering: LAST → FIRST (reverse of pourStats)
  const cinematicList = useMemo(() => {
    const reversed = [...pourStats].reverse(); // low → high
    return reversed;
  }, [pourStats]);

  // Clamp step so realtime changes don’t break the UI
  useEffect(() => {
    const maxStep = Math.max(0, cinematicList.length); // last step is "final results"
    setCinematicStep((prev) => Math.min(prev, maxStep));
  }, [cinematicList.length]);

  const stepCount = useMemo(() => Math.max(1, cinematicList.length + 1), [cinematicList.length]); // +1 final screen
  const isFinalStep = useMemo(
    () => cinematicStep >= cinematicList.length,
    [cinematicStep, cinematicList.length]
  );

  const activeCinematic = useMemo(() => {
    if (isFinalStep) return null;
    return cinematicList[cinematicStep] || null;
  }, [cinematicList, cinematicStep, isFinalStep]);

  // For the current pour card: build “shoutout chips” only when they apply to *this pour*
  const shoutoutChipsForPour = useMemo(() => {
    const ps = activeCinematic;
    if (!ps) return [];

    const pourId = ps.pour.id;
    const chips: { text: string; kind: "best" | "least" | "neutral"; value?: number; max?: number }[] =
      [];

    for (const u of participants) {
      const uStats = perUserRankings[u.id];
      if (!uStats) continue;

      // Winner / least favorite (by total)
      if (uStats.best && uStats.best.pour.id === pourId) {
        chips.push({
          text: `${u.display_name}'s WINNER (${uStats.best.total.toFixed(0)}/100)`,
          kind: "best",
          value: uStats.best.total,
          max: 100,
        });
      }
      if (uStats.least && uStats.least.pour.id === pourId) {
        chips.push({
          text: `${u.display_name}'s LEAST FAVORITE (${uStats.least.total.toFixed(0)}/100)`,
          kind: "least",
          value: uStats.least.total,
          max: 100,
        });
      }

      // Best/Worst per category
      for (const c of CATEGORY) {
        const best = uStats.catBest[c.key];
        if (best && best.pour.id === pourId) {
          chips.push({
            text: `${u.display_name}'s best ${c.label.toUpperCase()} (${best.value.toFixed(0)}/${best.max})`,
            kind: "best",
            value: best.value,
            max: best.max,
          });
        }
        const worst = uStats.catWorst[c.key];
        if (worst && worst.pour.id === pourId) {
          chips.push({
            text: `${u.display_name}'s least favorite ${c.label.toUpperCase()} (${worst.value.toFixed(
              0
            )}/${worst.max})`,
            kind: "least",
            value: worst.value,
            max: worst.max,
          });
        }
      }
    }

    // Keep it readable if you have lots of users
    return chips.slice(0, 24);
  }, [activeCinematic, participants, perUserRankings]);

  const notesForActivePour = useMemo(() => {
    if (!activeCinematic) return [];

    const participantById = new Map(participants.map((p) => [p.id, p]));

    return scores
      .filter((s) => s.pour_id === activeCinematic.pour.id)
      .map((s) => ({
        participantName: participantById.get(s.participant_id)?.display_name || "Someone",
        notes: (s.notes || "").trim(),
      }))
      .filter((row) => row.notes.length > 0);
  }, [activeCinematic, participants, scores]);

  const refresh = async () => {
    if (!sessionId) return;
    try {
      await loadAll(sessionId);
    } catch {
      // ignore
    }
  };

  // ---------- UI states ----------
  if (loading) {
    return (
      <main className="min-h-screen bg-black text-white flex items-center justify-center p-6">
        <div className="text-zinc-400">Preparing reveal…</div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="min-h-screen bg-black text-white flex items-center justify-center p-6">
        <div className="max-w-lg w-full bg-zinc-950 border border-zinc-800 rounded-3xl p-6">
          <div className="text-2xl font-extrabold">Reveal Error</div>
          <div className="text-zinc-400 mt-2">{error}</div>
        </div>
      </main>
    );
  }

  if (!session) return null;

  // Waiting screen (blind sessions) until BIG REVEAL
  if (!isRevealed && session.is_blind) {
    return (
      <main className="min-h-screen bg-black text-white p-6 flex items-center justify-center">
        <div className="max-w-xl w-full bg-zinc-950 border border-zinc-800 rounded-3xl p-8 text-center">
          <div className="text-sm text-zinc-400">Cask Unknown</div>
          <div className="text-3xl font-extrabold mt-2">{session.title}</div>
          <div className="text-zinc-400 mt-3">Waiting for the host…</div>

          <div className="mt-6 text-xs text-zinc-500">
            {isRevealReady
              ? "SOFT REVEAL is live — Packaging + Value scoring is open. BIG REVEAL is coming next."
              : "Once BIG REVEAL happens, bottle names + winners will appear here."}
          </div>
        </div>
      </main>
    );
  }

  // ---------- BIG REVEAL (cinematic) ----------
  const title = session.title;

  // Final Results screen
  if (isFinalStep) {
    return (
      <main className="min-h-screen bg-black text-white p-6">
        <div className="max-w-6xl mx-auto">
          <div className="bg-zinc-950 border border-zinc-800 rounded-3xl p-8 shadow-xl">
            <div className="text-sm text-zinc-400">FINAL RESULTS</div>
            <div className="mt-2 text-4xl font-extrabold tracking-tight">{title}</div>

            <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Winner card */}
              <div className="bg-black/40 border border-zinc-800 rounded-3xl p-6">
                <div className="text-xs text-zinc-400">Overall Winner</div>
                <div className="text-3xl font-extrabold mt-2">
                  {overallWinner ? displayPourName(overallWinner.pour) : "—"}
                </div>
                <div className="text-zinc-400 mt-2">
                  Avg:{" "}
                  <span className="font-semibold text-white">
                    {overallWinner ? overallWinner.avgTotal.toFixed(1) : "0.0"}
                  </span>{" "}
                  / 100 • Scorecards: {overallWinner ? overallWinner.count : 0}
                </div>
              </div>

              {/* Category shoutouts (ALL categories) */}
              <div className="bg-black/40 border border-zinc-800 rounded-3xl p-6">
                <div className="text-xs text-zinc-400">Category Shoutouts</div>
                <div className="mt-4 space-y-2">
                  {categoryWinners.map((w) => (
                    <div key={w.label} className="flex items-center justify-between gap-4">
                      <div className="text-zinc-300 font-semibold">Best {w.label}:</div>
                      <div className="text-zinc-100">
                        <span className="font-extrabold">
                          {w.pour ? displayPourName(w.pour) : "—"}
                        </span>{" "}
                        <span className="text-zinc-500">({w.value.toFixed(1)}/{w.max})</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Full ranking (Top → Bottom) */}
            <div className="mt-6 bg-black/40 border border-zinc-800 rounded-3xl p-6">
              <div className="text-sm text-zinc-400">Full Ranking (Top → Bottom)</div>

              <div className="mt-4 space-y-3">
                {pourStats.map((ps) => {
                  const rank = pourRankMeta[ps.pour.id];

                  return (
                    <div
                      key={ps.pour.id}
                      className="flex items-center justify-between gap-4 bg-black/30 border border-zinc-900 rounded-2xl px-4 py-3"
                    >
                      <div className="flex items-center gap-3">
                        <div className="rounded-full bg-zinc-900 border border-zinc-800 px-3 py-1 text-xs font-extrabold">
                          {formatRankLabel(rank)}
                        </div>
                        <div>
                          <div className="font-semibold">{displayPourName(ps.pour)}</div>
                          <div className="text-xs text-zinc-500">
                            {ps.pour.bottle_name ? ps.pour.bottle_name : "Bottle name not set"}
                          </div>
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="text-2xl font-extrabold tabular-nums">{ps.avgTotal.toFixed(1)}</div>
                        <div className="text-xs text-zinc-500">Avg / 100</div>
                      </div>
                    </div>
                  );
                })}
                {pourStats.length === 0 && <div className="text-zinc-400">No pours/scores yet.</div>}
              </div>
            </div>

            {/* Per-user full rankings */}
            <div className="mt-6 bg-black/40 border border-zinc-800 rounded-3xl p-6">
              <div className="text-sm text-zinc-400">Each Taster’s Ranking</div>

              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                {participants.map((u) => {
                  const uStats = perUserRankings[u.id];
                  const ranking = uStats?.ranking || [];

                  return (
                    <div key={u.id} className="bg-black/30 border border-zinc-900 rounded-3xl p-5">
                      <div className="text-xs text-zinc-500">{u.display_name}</div>

                      <div className="mt-2 flex flex-wrap gap-2">
                        {uStats?.best ? (
                          <span className={chipClass({ kind: "best", value: uStats.best.total, max: 100 })}>
                            WINNER: {displayPourName(uStats.best.pour)} ({uStats.best.total.toFixed(0)}/100)
                          </span>
                        ) : null}
                        {uStats?.least ? (
                          <span className={chipClass({ kind: "least", value: uStats.least.total, max: 100 })}>
                            LEAST FAVORITE: {displayPourName(uStats.least.pour)} ({uStats.least.total.toFixed(0)}/100)
                          </span>
                        ) : null}
                      </div>

                      <div className="mt-4 space-y-2">
                        {ranking.length ? (
                          ranking.map((r) => {
                            const rank = perUserRankMeta[u.id]?.[r.pour.id];

                            return (
                              <div
                                key={`${u.id}-${r.pour.id}`}
                                className="flex items-center justify-between gap-3 bg-black/20 border border-zinc-900 rounded-2xl px-3 py-2"
                              >
                                <div className="flex items-center gap-3">
                                  <div className="rounded-full bg-zinc-900 border border-zinc-800 px-3 py-1 text-[11px] font-extrabold">
                                    {formatRankLabel(rank)}
                                  </div>
                                  <div className="font-semibold">{displayPourName(r.pour)}</div>
                                </div>
                                <div className="text-zinc-200 font-extrabold tabular-nums">
                                  {r.total.toFixed(0)}
                                  <span className="text-xs text-zinc-500 font-semibold">/100</span>
                                </div>
                              </div>
                            );
                          })
                        ) : (
                          <div className="text-sm text-zinc-500">No scores from this taster yet.</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="mt-6 flex flex-col md:flex-row gap-3">
              <button
                onClick={() => setCinematicStep(0)}
                className="w-full md:w-auto px-5 py-3 rounded-2xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-white font-semibold"
              >
                Restart Cinematic (Last → First)
              </button>

              <button
                onClick={refresh}
                className="w-full md:w-auto px-5 py-3 rounded-2xl bg-amber-500 hover:bg-amber-600 text-black font-extrabold"
              >
                Refresh Data
              </button>
            </div>

            <div className="mt-6 text-center text-xs text-zinc-600">Cask Unknown • Dark Reveal Mode</div>
          </div>
        </div>
      </main>
    );
  }

  // Cinematic pour screen
  const ps = activeCinematic;

  const placeMeta = ps ? pourRankMeta[ps.pour.id] : null;
  const placeFromTop = placeMeta?.rank ?? 0;

  const totalPlaces = Math.max(0, pours.length);

  return (
    <main className="min-h-screen bg-black text-white p-6">
      <div className="max-w-6xl mx-auto">
        <div className="bg-zinc-950 border border-zinc-800 rounded-3xl p-8 shadow-xl">
          <div className="flex items-start justify-between gap-6">
            <div>
              <div className="text-sm text-zinc-400">BIG REVEAL</div>
              <div className="mt-2 text-4xl font-extrabold tracking-tight">{title}</div>
              {placeMeta?.tied ? (
                <div className="mt-2 text-sm font-semibold text-amber-400">{formatRankLabel(placeMeta)}</div>
              ) : null}
              <div className="text-zinc-400 mt-2 text-sm">
                Step {cinematicStep + 1} / {stepCount} • Revealing from last place → #1
              </div>
            </div>

            {/* ✅ BIGGER place badge */}
            <div className="shrink-0">
              <div className="bg-black/40 border border-zinc-800 rounded-3xl px-8 py-6 text-center min-w-[150px]">
                <div className="text-xs uppercase tracking-widest text-zinc-400">Place</div>
                <div className="mt-2 text-7xl leading-none font-extrabold tabular-nums">
                  {placeFromTop || "—"}
                </div>
                <div className="mt-2 text-sm text-zinc-500">
                  of <span className="font-semibold text-zinc-300">{totalPlaces || "—"}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Main card */}
          <div className="mt-6 bg-black/40 border border-zinc-800 rounded-3xl p-6">
            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-6">
              <div>
                <div className="text-xs text-zinc-500">Pour</div>
                <div className="text-5xl font-extrabold mt-1">{ps ? displayPourName(ps.pour) : "—"}</div>
                <div className="text-zinc-500 mt-2">
                  {ps?.pour.bottle_name ? ps.pour.bottle_name : "Bottle name not set"}
                </div>

                {/* Shoutout chips */}
                <div className="mt-4 flex flex-wrap gap-2">
                  {shoutoutChipsForPour.length ? (
                    shoutoutChipsForPour.map((c, i) => (
                      <span
                        key={`${i}-${c.text}`}
                        className={chipClass({ kind: c.kind, value: c.value, max: c.max })}
                      >
                        {c.text}
                      </span>
                    ))
                  ) : (
                    <span className="text-xs text-zinc-500">No shoutouts yet (need more scores).</span>
                  )}
                </div>
              </div>

              <div className="text-right">
                <div className="text-xs text-zinc-500">Average Score</div>
                <div className="text-6xl font-extrabold tabular-nums mt-1">
                  {ps ? ps.avgTotal.toFixed(1) : "0.0"}
                </div>
                <div className="text-zinc-500 mt-1 text-sm">
                  Avg / 100 • {ps ? ps.count : 0} scorecards
                </div>
              </div>
            </div>

            {/* ALL categories tiles (avg per category) - text-only color (no yellow) */}
            <div className="mt-6 grid grid-cols-2 md:grid-cols-5 gap-3">
              {CATEGORY.map((c) => {
                const v = ps ? clamp01(ps.avgByCat[c.key] ?? 0) : 0;
                const colors = scoreColor(v, c.max);

                return (
                  <div key={c.key} className="border border-zinc-800 rounded-2xl p-4 bg-black/20">
                    <div className="text-xs text-zinc-400">{c.label}</div>
                    <div
                      className={[
                        "mt-1 text-2xl font-extrabold tabular-nums",
                        colors.text,
                        colors.glow,
                      ].join(" ")}
                    >
                      {v.toFixed(1)}
                      <span className="text-xs text-zinc-500 font-semibold">/{c.max}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-6 bg-black/20 border border-zinc-800 rounded-2xl p-4">
              <div className="text-xs text-zinc-400">Taster Notes</div>
              <div className="mt-3 space-y-3">
                {notesForActivePour.length ? (
                  notesForActivePour.map((row, idx) => (
                    <div
                      key={`${row.participantName}-${idx}`}
                      className="border-b border-zinc-900 pb-3 last:border-b-0 last:pb-0"
                    >
                      <div className="text-sm font-semibold text-zinc-200">{row.participantName} says:</div>
                      <div className="mt-1 text-sm text-zinc-400">{row.notes}</div>
                    </div>
                  ))
                ) : (
                  <div className="text-sm text-zinc-500">No tasting notes were saved for this pour.</div>
                )}
              </div>
            </div>
          </div>

          {/* Controls */}
          <div className="mt-6 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
            <button
              onClick={() => setCinematicStep((s) => Math.max(0, s - 1))}
              disabled={cinematicStep === 0}
              className={[
                "px-5 py-3 rounded-2xl font-semibold border",
                cinematicStep === 0
                  ? "bg-zinc-900/40 border-zinc-800 text-zinc-500 cursor-not-allowed"
                  : "bg-zinc-900 hover:bg-zinc-800 border-zinc-800 text-white",
              ].join(" ")}
            >
              ← Prev
            </button>

            <button
              onClick={() => setCinematicStep(cinematicList.length)}
              className="px-5 py-3 rounded-2xl font-semibold bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-white"
            >
              Skip to Final Results
            </button>

            <button
              onClick={() => setCinematicStep((s) => Math.min(cinematicList.length, s + 1))}
              className="px-6 py-3 rounded-2xl font-extrabold bg-amber-500 hover:bg-amber-600 text-black"
            >
              Next →
            </button>
          </div>

          <div className="mt-4 text-xs text-zinc-600">
            Tip: This screen is meant for TV/iPad. Tap Next to climb from last place to #1.
          </div>
        </div>
      </div>
    </main>
  );
}
