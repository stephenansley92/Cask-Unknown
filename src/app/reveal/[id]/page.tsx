"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { ConnectionBanner } from "@/components/connection-banner";
import {
  ChevronLeft,
  ChevronRight,
  Copy,
  DollarSign,
  Download,
  GlassWater,
  Play,
  RefreshCw,
  Share2,
  SkipForward,
  Target,
  Trophy,
  Users,
} from "lucide-react";
import { FlavorTagList } from "@/components/flavor-tags";
import { countFlavorTags } from "@/lib/flavor-tags";
import {
  contrarian,
  giantKiller,
  guessLeaderboard,
  pairMatches,
  pourGuessSummary,
  pourPrice,
  tasteTwins,
  twinFor,
  valueRows,
  type Guess,
} from "@/lib/reveal/insights";
import { matchLabel } from "@/lib/palate/profile";
import { Button } from "@/components/ui/button";
import { Card, Eyebrow } from "@/components/ui/card";
import { LoadingScreen, Wordmark } from "@/components/ui/brand";
import { Notice } from "@/components/ui/notice";
import { PageShell } from "@/components/ui/page";
import { Toast } from "@/components/ui/toast";
import { cx } from "@/components/ui/cx";
import confetti from "canvas-confetti";
import { useWakeLock } from "@/lib/use-wake-lock";
import { getRevealSession } from "@/lib/session-api";

type SessionRow = {
  id: string;
  title: string;
  is_blind: boolean;
  status: string;
  created_at?: string | null;
  guess_bottles?: boolean;
  guess_proof?: boolean;
  guess_price?: boolean;
};

type PourRow = {
  id: string;
  session_id: string;
  code: string;
  bottle_name: string | null;
  sort_order: number;
  // Bottle facts arrive once names are visible (reveal-night migration).
  whiskey_id?: string | null;
  distillery?: string | null;
  proof?: number | string | null;
  category?: string | null;
  subcategory?: string | null;
  msrp?: number | string | null;
  secondary?: number | string | null;
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
  flavor_tags?: string[] | null;
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

type CategoryKey = (typeof CATEGORY)[number]["key"];

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
 * Score color scale, applied to text and thin bars only (cards stay dark):
 * low → danger, lower-mid → orange, mid → neutral, high → success.
 * A perfect score gets a soft success glow.
 */
function scoreColor(value: number, max: number) {
  const r = ratio(value, max);

  if (isPerfect(value, max)) {
    return {
      text: "text-success",
      bar: "bg-success",
      glow: "drop-shadow-[0_0_8px_rgb(130_209_166/0.55)]",
    };
  }

  if (r < 0.3) {
    return { text: "text-danger", bar: "bg-danger", glow: "" };
  }

  if (r < 0.5) {
    return { text: "text-orange-300", bar: "bg-orange-300", glow: "" };
  }

  if (r < 0.7) {
    return { text: "text-fg", bar: "bg-fg-muted", glow: "" };
  }

  return { text: "text-success", bar: "bg-success", glow: "" };
}

function chipClass(kind: "best" | "least") {
  return [
    "inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold",
    kind === "best" ? "bg-success-soft border-success/30 text-success" : "bg-danger-soft border-danger/30 text-danger",
  ].join(" ");
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

function formatDate(value?: string | null) {
  if (!value) return "Unknown date";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown date";
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function sanitizeFilename(value: string) {
  const clean = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return clean || "cask-unknown-results";
}

function standardDeviation(values: number[]) {
  if (values.length < 2) return 0;
  const mean = avg(values);
  const variance = avg(values.map((value) => (value - mean) ** 2));
  return Math.sqrt(variance);
}

function getScoreCategory(score: ScoreRow, key: CategoryKey) {
  return clamp01(Number(score[key] ?? 0));
}

export default function RevealPage() {
  const params = useParams<{ id: string }>();
  const sessionId = params?.id;

  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<SessionRow | null>(null);
  const [pours, setPours] = useState<PourRow[]>([]);
  const [participants, setParticipants] = useState<ParticipantRow[]>([]);
  const [scores, setScores] = useState<ScoreRow[]>([]);
  const [guesses, setGuesses] = useState<Guess[]>([]);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [currentParticipantId, setCurrentParticipantId] = useState("");
  const [shareHint, setShareHint] = useState("");
  const prevStepRef = useRef<number>(-1);

  // Cinematic mode: step through from LAST → FIRST, then final screen
  const [cinematicStep, setCinematicStep] = useState(0);

  const loadAll = async (id: string) => {
    const { data: snapshot, error: snapshotError } = await getRevealSession(supabase, id);
    if (snapshotError || !snapshot) throw snapshotError || new Error("Session not found.");

    setSession(snapshot.session as SessionRow);
    setPours(snapshot.pours as PourRow[]);
    setParticipants(snapshot.participants as ParticipantRow[]);
    setScores(snapshot.scores as ScoreRow[]);
    setGuesses((snapshot.guesses ?? []) as Guess[]);
  };

  const runLoad = async () => {
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
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error.");
      setLoading(false);
    }
  };

  useEffect(() => {
    runLoad();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId || typeof window === "undefined") return;

    try {
      const raw = window.localStorage.getItem(`cask_unknown_participant_${sessionId}`);
      const parsed = JSON.parse(raw || "null") as { participantId?: string } | null;
      setCurrentParticipantId(parsed?.participantId || "");
    } catch {
      setCurrentParticipantId("");
    }
  }, [sessionId]);

  // ✅ realtime subscriptions (TV updates instantly)
  useEffect(() => {
    if (!sessionId) return;

    // Coalesce bursts of change events (e.g. every taster autosaving during
    // reveal-stage scoring) into one reload per table per window instead of
    // one full reload per event.
    const refreshTimers: Record<string, number> = {};
    const scheduleRefresh = (kind: string, task: () => Promise<void>) => {
      if (refreshTimers[kind]) window.clearTimeout(refreshTimers[kind]);
      refreshTimers[kind] = window.setTimeout(() => {
        delete refreshTimers[kind];
        void task();
      }, 400);
    };

    const reloadAll = async () => {
      try {
        await loadAll(sessionId);
      } catch (syncError) {
        console.warn("Reveal sync failed:", syncError);
      }
    };

    const channel = supabase
      .channel(`reveal-live-${sessionId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "sessions", filter: `id=eq.${sessionId}` },
        () => scheduleRefresh("session", reloadAll)
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "scores", filter: `session_id=eq.${sessionId}` },
        () => scheduleRefresh("scores", reloadAll)
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pours", filter: `session_id=eq.${sessionId}` },
        () => scheduleRefresh("pours", reloadAll)
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "participants",
          filter: `session_id=eq.${sessionId}`,
        },
        () => scheduleRefresh("participants", reloadAll)
      )
      .subscribe();

    return () => {
      for (const timer of Object.values(refreshTimers)) window.clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [sessionId]);

  const status = (session?.status || "").toLowerCase();
  const isRevealed = status === "revealed";
  const isRevealReady = status === "reveal_ready";

  useWakeLock(Boolean(session));

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
        byPour[p.id].avgByCat[c.key] = avg(s.map((score) => getScoreCategory(score, c.key)));
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
        for (const c of CATEGORY) byCat[c.key] = getScoreCategory(s, c.key);
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

  const scoreSpreadByPour = useMemo(() => {
    const out: Record<string, { pour: PourRow; spread: number; scores: number[] }> = {};

    for (const pour of pours) {
      const totals = scores
        .filter((score) => score.pour_id === pour.id)
        .map((score) => clamp01(Number(score.total ?? 0)));

      out[pour.id] = {
        pour,
        spread: standardDeviation(totals),
        scores: totals,
      };
    }

    return out;
  }, [pours, scores]);

  const mostDivisivePour = useMemo(() => {
    return Object.values(scoreSpreadByPour)
      .filter((row) => row.scores.length > 1)
      .sort((a, b) => b.spread - a.spread)[0] || null;
  }, [scoreSpreadByPour]);

  const currentParticipant = useMemo(
    () => participants.find((participant) => participant.id === currentParticipantId) || null,
    [currentParticipantId, participants]
  );

  const personalRecap = useMemo(() => {
    if (!currentParticipant) return null;

    const userStats = perUserRankings[currentParticipant.id];
    const ranking = userStats?.ranking || [];
    if (!ranking.length) return null;

    const statsByPourId = new Map(pourStats.map((stats) => [stats.pour.id, stats]));
    const userRankByPourId = perUserRankMeta[currentParticipant.id] || {};
    const top = ranking[0];

    const higherThanGroup = ranking
      .map((row) => {
        const groupAverage = statsByPourId.get(row.pour.id)?.avgTotal ?? 0;
        return {
          pour: row.pour,
          userTotal: row.total,
          groupAverage,
          delta: row.total - groupAverage,
        };
      })
      .sort((a, b) => b.delta - a.delta)[0] || null;

    const biggestSurprise = ranking
      .map((row) => {
        const userRank = userRankByPourId[row.pour.id];
        const groupRank = pourRankMeta[row.pour.id];

        return {
          pour: row.pour,
          userRank,
          groupRank,
          gap: Math.abs((userRank?.rank || 0) - (groupRank?.rank || 0)),
        };
      })
      .filter((row) => row.userRank && row.groupRank)
      .sort((a, b) => b.gap - a.gap)[0] || null;

    return {
      participant: currentParticipant,
      top,
      topGroupRank: pourRankMeta[top.pour.id] || null,
      higherThanGroup,
      biggestSurprise,
    };
  }, [currentParticipant, perUserRankings, perUserRankMeta, pourRankMeta, pourStats]);

  const pairs = useMemo(() => pairMatches(participants, scores), [participants, scores]);
  const twins = useMemo(() => tasteTwins(pairs), [pairs]);
  const tableContrarian = useMemo(() => contrarian(participants, scores), [participants, scores]);
  const yourTwin = useMemo(
    () => (currentParticipant ? twinFor(currentParticipant.id, pairs) : null),
    [currentParticipant, pairs]
  );

  const valueTable = useMemo(
    () =>
      valueRows(
        pourStats.map((ps) => ({
          id: ps.pour.id,
          name: displayPourName(ps.pour),
          avgTotal: ps.avgTotal,
          msrp: Number(ps.pour.msrp) || null,
          secondary: Number(ps.pour.secondary) || null,
        }))
      ),
    // displayPourName only depends on session state already in pourStats' inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pourStats, session?.is_blind, isRevealed]
  );
  const bestValue = valueTable[0] ?? null;
  const upset = useMemo(() => giantKiller(valueTable), [valueTable]);

  const guessBoard = useMemo(
    () => guessLeaderboard(participants, pours, guesses),
    [participants, pours, guesses]
  );

  const tagsByPour = useMemo(() => {
    const out: Record<string, { tag: string; count: number }[]> = {};
    for (const pour of pours) {
      out[pour.id] = countFlavorTags(scores.filter((sc) => sc.pour_id === pour.id).map((sc) => sc.flavor_tags));
    }
    return out;
  }, [pours, scores]);

  // Cinematic ordering: LAST → FIRST (reverse of pourStats)
  const cinematicList = useMemo(() => {
    const reversed = [...pourStats].reverse(); // low → high
    return reversed;
  }, [pourStats]);

  // Clamp step so realtime changes don’t break the UI
  useEffect(() => {
    const maxStep = Math.max(0, cinematicList.length);
    setCinematicStep((prev) => Math.min(prev, maxStep));
  }, [cinematicList.length]);

  // Fire confetti when the #1 ranked pour is revealed
  useEffect(() => {
    if (prevStepRef.current === cinematicStep) return;
    prevStepRef.current = cinematicStep;

    const current = cinematicList[cinematicStep];
    if (!current) return;
    const rank = pourRankMeta[current.pour.id];
    if (rank?.rank === 1) {
      confetti({ particleCount: 160, spread: 80, origin: { y: 0.5 }, colors: ["#f59e0b", "#ffffff", "#fcd34d"] });
      setTimeout(() => confetti({ particleCount: 80, spread: 60, origin: { y: 0.6 }, angle: 60 }), 300);
      setTimeout(() => confetti({ particleCount: 80, spread: 60, origin: { y: 0.6 }, angle: 120 }), 500);
    }
  }, [cinematicStep, cinematicList, pourRankMeta]);

  const stepCount = useMemo(() => Math.max(1, cinematicList.length + 1), [cinematicList.length]); // +1 final screen
  const isFinalStep = useMemo(
    () => cinematicStep >= cinematicList.length,
    [cinematicStep, cinematicList.length]
  );

  // Arrow keys, space, and presentation clickers (PageUp/PageDown) drive the
  // cinematic reveal on a TV. The final results page keeps normal scrolling.
  const cinematicActive = Boolean(session) && (isRevealed || !session?.is_blind) && !isFinalStep;
  useEffect(() => {
    if (!cinematicActive) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target instanceof HTMLElement ? e.target : null;
      if (target?.closest("input, textarea, select, [contenteditable]")) return;
      // A focused button already turns space into a click.
      if (e.key === " " && target?.closest("button")) return;
      if (e.key === "ArrowRight" || e.key === "PageDown" || e.key === " ") {
        e.preventDefault();
        setCinematicStep((step) => Math.min(cinematicList.length, step + 1));
      } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        setCinematicStep((step) => Math.max(0, step - 1));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cinematicActive, cinematicList.length]);

  // Each reveal step (and the results page) starts at the top on phones.
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [cinematicStep]);

  const activeCinematic = useMemo(() => {
    if (isFinalStep) return null;
    return cinematicList[cinematicStep] || null;
  }, [cinematicList, cinematicStep, isFinalStep]);

  // Shoutouts for the pour on screen, grouped by honor so a TV shows
  // "Best nose: Stephen, Maya" instead of one chip per person.
  const shoutoutChipsForPour = useMemo(() => {
    const ps = activeCinematic;
    if (!ps) return [];

    const pourId = ps.pour.id;
    const order = [
      "favorite",
      "least",
      ...CATEGORY.map((c) => `best-${c.key}`),
      ...CATEGORY.map((c) => `worst-${c.key}`),
    ];
    const groups = new Map<string, { label: string; kind: "best" | "least"; names: string[] }>();
    const add = (key: string, label: string, kind: "best" | "least", name: string) => {
      const group = groups.get(key) ?? { label, kind, names: [] };
      group.names.push(name);
      groups.set(key, group);
    };

    for (const u of participants) {
      const uStats = perUserRankings[u.id];
      if (!uStats) continue;
      // With a single scorecard, a taster's favorite and least favorite are the same pour.
      const hasSpread = uStats.ranking.length > 1;

      if (uStats.best?.pour.id === pourId) add("favorite", "Favorite", "best", u.display_name);
      if (hasSpread && uStats.least?.pour.id === pourId) {
        add("least", "Least favorite", "least", u.display_name);
      }

      for (const c of CATEGORY) {
        const best = uStats.catBest[c.key];
        const worst = uStats.catWorst[c.key];
        // Skip categories where the taster scored every pour the same.
        if (!best || !worst || best.value === worst.value) continue;
        if (best.pour.id === pourId) add(`best-${c.key}`, `Best ${c.label.toLowerCase()}`, "best", u.display_name);
        if (worst.pour.id === pourId) add(`worst-${c.key}`, `Weakest ${c.label.toLowerCase()}`, "least", u.display_name);
      }
    }

    return [...groups.entries()]
      .sort(([a], [b]) => order.indexOf(a) - order.indexOf(b))
      .map(([, g]) => ({ text: `${g.label}: ${g.names.join(", ")}`, kind: g.kind }));
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
    if (!sessionId || refreshing) return;
    try {
      setRefreshing(true);
      await loadAll(sessionId);
    } catch (e: unknown) {
      console.warn("Manual refresh failed:", e instanceof Error ? e.message : e);
    } finally {
      setRefreshing(false);
    }
  };

  const buildResultText = () => {
    return [
      `${title} - Final Results`,
      "",
      `Winner: ${overallWinner ? displayPourName(overallWinner.pour) : "No winner yet"}`,
      `Tasters: ${participants.length}`,
      `Date: ${formatDate(session?.created_at)}`,
      "",
      "Overall Ranking:",
      ...pourStats.map((ps, index) => {
        const rank = pourRankMeta[ps.pour.id];
        return `${formatRankLabel(rank || { rank: index + 1, tied: false, size: 1 })}: ${displayPourName(
          ps.pour
        )} - ${ps.avgTotal.toFixed(1)}/100`;
      }),
      "",
      ...(guessBoard[0]
        ? ["", `Best palate: ${guessBoard[0].participant.display_name} (${guessBoard[0].points} pts)`]
        : []),
      ...(bestValue ? [`Best value: ${bestValue.name} - ${bestValue.avgTotal.toFixed(1)} at ${bestValue.price}`] : []),
      "",
      "Category Winners:",
      ...categoryWinners.map(
        (winner) =>
          `Best ${winner.label}: ${winner.pour ? displayPourName(winner.pour) : "-"} (${winner.value.toFixed(
            1
          )}/${winner.max})`
      ),
    ].join("\n");
  };

  const showShareHint = (message: string) => {
    setShareHint(message);
    window.setTimeout(() => setShareHint(""), 2200);
  };

  const copyResults = async () => {
    try {
      await navigator.clipboard.writeText(buildResultText());
      showShareHint("Results copied.");
    } catch {
      showShareHint("Could not copy results.");
    }
  };

  const shareResults = async () => {
    const text = buildResultText();
    const url = typeof window !== "undefined" ? window.location.href : "";

    try {
      if (navigator.share) {
        await navigator.share({ title: `${title} Results`, text, url });
        return;
      }

      await navigator.clipboard.writeText(`${text}\n\n${url}`);
      showShareHint("Results copied.");
    } catch {
      showShareHint("Share cancelled.");
    }
  };

  const downloadRecapCard = () => {
    const topRows = pourStats.slice(0, 5);
    const categoryRows = categoryWinners.slice(0, 5);
    const safeTitle = escapeXml(title);
    const winnerName = escapeXml(overallWinner ? displayPourName(overallWinner.pour) : "No winner yet");
    const date = escapeXml(formatDate(session?.created_at));

    const rankingSvg = topRows
      .map((row, index) => {
        const y = 360 + index * 54;
        const rank = pourRankMeta[row.pour.id];
        return `
          <text x="84" y="${y}" fill="#ab9f90" font-size="24" font-weight="700">${escapeXml(
            formatRankLabel(rank || { rank: index + 1, tied: false, size: 1 })
          )}</text>
          <text x="220" y="${y}" fill="#f1e9de" font-size="26" font-weight="800">${escapeXml(
            displayPourName(row.pour)
          )}</text>
          <text x="1010" y="${y}" fill="#e3a94f" font-size="26" font-weight="900" text-anchor="end">${row.avgTotal.toFixed(
            1
          )}</text>`;
      })
      .join("");

    const categorySvg = categoryRows
      .map((row, index) => {
        const y = 680 + index * 42;
        return `
          <text x="84" y="${y}" fill="#ab9f90" font-size="21" font-weight="700">Best ${escapeXml(
            row.label
          )}</text>
          <text x="300" y="${y}" fill="#f1e9de" font-size="21" font-weight="800">${escapeXml(
            row.pour ? displayPourName(row.pour) : "-"
          )}</text>
          <text x="1010" y="${y}" fill="#f1e9de" font-size="21" font-weight="700" text-anchor="end">${row.value.toFixed(
            1
          )}/${row.max}</text>`;
      })
      .join("");

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080" viewBox="0 0 1080 1080">
      <rect width="1080" height="1080" fill="#13100d"/>
      <rect x="48" y="48" width="984" height="984" rx="36" fill="#1c1814" stroke="#2f2923" stroke-width="2"/>
      <text x="84" y="124" fill="#ab9f90" font-family="Arial, sans-serif" font-size="22" font-weight="700" letter-spacing="4">CASK UNKNOWN</text>
      <text x="84" y="184" fill="#f1e9de" font-family="Arial, sans-serif" font-size="48" font-weight="700" font-family="Georgia, 'Times New Roman', serif">${safeTitle}</text>
      <text x="84" y="236" fill="#ab9f90" font-family="Arial, sans-serif" font-size="24">${date} • ${participants.length} tasters • ${pours.length} pours</text>
      <rect x="84" y="274" width="912" height="86" rx="24" fill="#0f0c0a" stroke="#2f2923"/>
      <text x="116" y="326" fill="#e3a94f" font-family="Arial, sans-serif" font-size="26" font-weight="800">Winner</text>
      <text x="260" y="326" fill="#f1e9de" font-family="Arial, sans-serif" font-size="32" font-weight="700" font-family="Georgia, 'Times New Roman', serif">${winnerName}</text>
      <g font-family="Arial, sans-serif">${rankingSvg}</g>
      <line x1="84" y1="628" x2="996" y2="628" stroke="#2f2923"/>
      <text x="84" y="650" fill="#ab9f90" font-family="Arial, sans-serif" font-size="22" font-weight="800">CATEGORY WINNERS</text>
      <g font-family="Arial, sans-serif">${categorySvg}</g>
      <text x="84" y="972" fill="#7c7166" font-family="Arial, sans-serif" font-size="22">Shareable recap generated by Cask Unknown</text>
    </svg>`;

    const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${sanitizeFilename(title)}-recap.svg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
    showShareHint("Recap card downloaded.");
  };

  // ---------- UI states ----------
  if (loading) {
    return <LoadingScreen label="Preparing the reveal" />;
  }

  if (error) {
    return (
      <PageShell center>
        <div className="w-full text-center">
          <Wordmark size="lg" />
          <Notice tone="danger" title="The reveal didn't load" className="mt-8 text-left">
            {error}
          </Notice>
          <Button variant="primary" size="lg" block className="mt-4" onClick={() => void runLoad()}>
            Try again
          </Button>
        </div>
      </PageShell>
    );
  }

  if (!session) return null;

  const title = session.title;

  // Waiting screen (blind sessions) until BIG REVEAL
  if (!isRevealed && session.is_blind) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center bg-canvas p-6 text-center text-fg">
        <ConnectionBanner />
        <div className="w-full max-w-2xl animate-fade-in">
          <Wordmark />
          <h1 className="mt-6 font-display text-4xl font-semibold tracking-tight md:text-6xl">{title}</h1>

          <div className="mx-auto mt-10 flex h-20 w-20 items-center justify-center rounded-full border border-accent/30 bg-accent-soft animate-reveal-pulse">
            <GlassWater className="h-9 w-9 text-accent" />
          </div>

          <div className="mt-8 text-lg font-semibold">
            {isRevealReady ? "Soft reveal is live" : "Tasting in progress"}
          </div>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-fg-muted">
            {isRevealReady
              ? "Tasters are scoring packaging and value. The big reveal is next."
              : "Bottle names and winners will appear here the moment the host starts the big reveal."}
          </p>

          <Button variant="ghost" size="sm" className="mt-8" onClick={() => void runLoad()} disabled={refreshing}>
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </Button>
        </div>
      </main>
    );
  }

  const pourSubtitle = (p: PourRow) =>
    displayPourName(p) !== `Pour ${p.code}` ? `Pour ${p.code}` : null;

  // "Buffalo Trace · 90 proof · $30" once the bottle is visible.
  const pourFacts = (p: PourRow) => {
    if (session.is_blind && !isRevealed) return null;
    const proof = Number(p.proof);
    const price = pourPrice(p);
    const parts = [
      p.distillery && p.distillery !== displayPourName(p) ? p.distillery : null,
      Number.isFinite(proof) && proof > 0 ? `${proof} proof` : null,
      price ? `${price.toFixed(0)}` : null,
    ].filter(Boolean);
    return parts.length ? parts.join(" · ") : null;
  };

  // ---------- Final Results ----------
  if (isFinalStep) {
    const podium = pourStats.slice(0, 3);
    const divisiveSpread = (mostDivisivePour?.spread ?? 0) >= 0.05;

    return (
      <PageShell width="xl">
        <ConnectionBanner />
        <Toast message={shareHint} />

        <header className="flex items-center justify-between gap-4">
          <Wordmark />
          <Button variant="ghost" size="sm" onClick={refresh} disabled={refreshing} className="-mr-3">
            <RefreshCw className={cx("h-3.5 w-3.5", refreshing && "animate-spin")} />
            {refreshing ? "Refreshing…" : "Refresh"}
          </Button>
        </header>

        <div className="mt-8">
          <Eyebrow>Final results</Eyebrow>
          <h1 className="mt-2 font-display text-4xl font-semibold tracking-tight md:text-5xl">{title}</h1>
          <p className="mt-2 text-sm text-fg-muted">
            {formatDate(session.created_at)} · {participants.length} tasters · {pours.length} pours
          </p>
        </div>

        {/* Podium */}
        {podium.length ? (
          <div className="mt-8 grid grid-cols-1 gap-3 md:grid-cols-3">
            {podium.map((row, index) => {
              const rank = pourRankMeta[row.pour.id];
              const isFirst = rank?.rank === 1;
              return (
                <div
                  key={`podium-${row.pour.id}`}
                  className={cx(
                    "rounded-3xl border p-6",
                    isFirst
                      ? "border-accent/40 bg-accent-soft md:order-2 md:-mt-4 md:pb-10"
                      : index === 1
                        ? "border-line bg-surface md:order-1"
                        : "border-line bg-surface md:order-3",
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className={cx("text-xs font-semibold uppercase tracking-[0.14em]", isFirst ? "text-accent" : "text-fg-faint")}>
                      {formatRankLabel(rank || { rank: index + 1, tied: false, size: 1 })}
                    </span>
                    {isFirst ? <Trophy className="h-6 w-6 text-accent" /> : null}
                  </div>
                  <div className={cx("mt-3 font-display font-semibold leading-tight", isFirst ? "text-3xl" : "text-2xl")}>
                    {displayPourName(row.pour)}
                  </div>
                  {pourSubtitle(row.pour) ? (
                    <div className="mt-0.5 text-xs text-fg-faint">{pourSubtitle(row.pour)}</div>
                  ) : null}
                  <div className="mt-4 flex items-baseline gap-1">
                    <span className={cx("font-display font-semibold tabular-nums", isFirst ? "text-5xl text-accent" : "text-4xl")}>
                      {row.avgTotal.toFixed(1)}
                    </span>
                    <span className="text-sm text-fg-faint">/ 100</span>
                  </div>
                  <div className="mt-1 text-xs text-fg-faint">{row.count} scorecards</div>
                </div>
              );
            })}
          </div>
        ) : (
          <Card className="mt-8 text-center text-fg-muted">No scores yet.</Card>
        )}

        <div className="mt-6 flex flex-wrap gap-2">
          <Button variant="primary" onClick={downloadRecapCard}>
            <Download className="h-4 w-4" /> Download recap card
          </Button>
          <Button variant="secondary" onClick={shareResults}>
            <Share2 className="h-4 w-4" /> Share results
          </Button>
          <Button variant="ghost" onClick={copyResults}>
            <Copy className="h-4 w-4" /> Copy as text
          </Button>
        </div>

        {guessBoard.length || twins || bestValue ? (
          <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {guessBoard.length ? (
              <Card padded={false}>
                <div className="flex items-center gap-2 px-5 pt-5">
                  <Target className="h-4 w-4 text-accent" />
                  <Eyebrow>Best palate</Eyebrow>
                </div>
                <ol className="mt-3">
                  {guessBoard.map((row, index) => (
                    <li key={row.participant.id} className="flex items-center gap-3 border-t border-line px-5 py-3">
                      <span
                        className={cx(
                          "w-5 shrink-0 text-center font-display font-semibold tabular-nums",
                          index === 0 ? "text-accent" : "text-fg-faint",
                        )}
                      >
                        {index + 1}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold">
                          {row.participant.display_name}
                          {row.participant.id === currentParticipantId ? (
                            <span className="ml-1.5 text-xs font-normal text-fg-faint">(you)</span>
                          ) : null}
                        </span>
                        {row.bottlesGuessed ? (
                          <span className="block text-xs text-fg-faint">
                            {row.bottlesCorrect} of {row.bottlesGuessed} bottles right
                          </span>
                        ) : null}
                      </span>
                      <span className="shrink-0 font-display text-xl font-semibold tabular-nums">
                        {row.points}
                        <span className="text-xs font-sans font-normal text-fg-faint"> pts</span>
                      </span>
                    </li>
                  ))}
                </ol>
              </Card>
            ) : null}

            {twins ? (
              <Card>
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-accent" />
                  <Eyebrow>Taste twins</Eyebrow>
                </div>
                <div className="mt-3 font-display text-2xl font-semibold leading-tight">
                  {twins.a.display_name} &amp; {twins.b.display_name}
                </div>
                <p className="mt-1 text-sm text-fg-muted">
                  {twins.correlation !== null
                    ? `${matchLabel(twins.correlation)} · `
                    : ""}
                  {twins.meanAbsDiff.toFixed(1)} points apart per pour on average
                </p>
                {tableContrarian && tableContrarian.offBy >= 3 ? (
                  <div className="mt-4 border-t border-line pt-4">
                    <Eyebrow>The contrarian</Eyebrow>
                    <div className="mt-1.5 font-semibold">{tableContrarian.participant.display_name}</div>
                    <p className="text-sm text-fg-muted">
                      {tableContrarian.offBy.toFixed(1)} points off the rest of the table per pour
                    </p>
                  </div>
                ) : null}
              </Card>
            ) : null}

            {bestValue ? (
              <Card padded={false}>
                <div className="flex items-center gap-2 px-5 pt-5">
                  <DollarSign className="h-4 w-4 text-accent" />
                  <Eyebrow>Best value</Eyebrow>
                </div>
                <div className="px-5">
                  <div className="mt-3 font-display text-2xl font-semibold leading-tight">{bestValue.name}</div>
                  <p className="mt-1 text-sm text-fg-muted">
                    {bestValue.avgTotal.toFixed(1)} points at ${bestValue.price.toFixed(0)} ·{" "}
                    {bestValue.pointsPerTenDollars.toFixed(1)} pts per $10
                  </p>
                  {upset ? (
                    <p className="mt-2 rounded-2xl bg-accent-soft px-3 py-2 text-sm text-accent">
                      {upset.winner.name} (${upset.winner.price.toFixed(0)}) beat {upset.beat.name} ($
                      {upset.beat.price.toFixed(0)}), a bottle {upset.priceRatio.toFixed(1)}× the price.
                    </p>
                  ) : null}
                </div>
                {valueTable.length > 1 ? (
                  <ol className="mt-3">
                    {valueTable.map((row) => (
                      <li key={row.id} className="flex items-center justify-between gap-3 border-t border-line px-5 py-2.5 text-sm">
                        <span className="min-w-0 truncate">{row.name}</span>
                        <span className="shrink-0 tabular-nums text-fg-muted">
                          ${row.price.toFixed(0)} · <span className="font-semibold text-fg">{row.pointsPerTenDollars.toFixed(1)}</span>
                        </span>
                      </li>
                    ))}
                  </ol>
                ) : null}
                <p className="px-5 pb-4 pt-2 text-[11px] text-fg-faint">Retail price where known, otherwise secondary.</p>
              </Card>
            ) : null}
          </div>
        ) : null}

        <div className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-5">
          {/* Full ranking */}
          <Card className="lg:col-span-3" padded={false}>
            <div className="px-5 pt-5">
              <Eyebrow>Full ranking</Eyebrow>
            </div>
            <ol className="mt-3">
              {pourStats.map((ps) => {
                const rank = pourRankMeta[ps.pour.id];
                return (
                  <li key={ps.pour.id} className="flex items-center gap-4 border-t border-line px-5 py-3.5">
                    <span
                      className={cx(
                        "w-16 shrink-0 text-xs font-bold",
                        rank?.rank === 1 ? "text-accent" : "text-fg-faint",
                      )}
                    >
                      {formatRankLabel(rank)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-semibold">
                        {ps.pour.whiskey_id && isRevealed ? (
                          <Link href={`/bottles/${ps.pour.whiskey_id}`} className="hover:text-accent">
                            {displayPourName(ps.pour)}
                          </Link>
                        ) : (
                          displayPourName(ps.pour)
                        )}
                      </div>
                      {tagsByPour[ps.pour.id]?.length ? (
                        <div className="mt-0.5 truncate text-xs text-fg-faint">
                          {tagsByPour[ps.pour.id].slice(0, 4).map((t) => t.tag).join(" · ")}
                        </div>
                      ) : null}
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-sunken">
                        <div
                          className={cx("h-full rounded-full", rank?.rank === 1 ? "bg-accent" : "bg-fg-faint")}
                          style={{ width: `${Math.min(100, Math.max(0, ps.avgTotal))}%` }}
                        />
                      </div>
                    </div>
                    <span className="w-12 shrink-0 text-right font-display text-xl font-semibold tabular-nums">
                      {ps.avgTotal.toFixed(1)}
                    </span>
                  </li>
                );
              })}
              {pourStats.length === 0 && <li className="border-t border-line px-5 py-4 text-fg-muted">No pours or scores yet.</li>}
            </ol>
          </Card>

          {/* Category winners */}
          <Card className="lg:col-span-2">
            <Eyebrow>Best in category</Eyebrow>
            <dl className="mt-3 divide-y divide-line">
              {categoryWinners.map((w) => (
                <div key={w.label} className="flex items-baseline justify-between gap-3 py-2">
                  <dt className="text-sm text-fg-muted">{w.label}</dt>
                  <dd className="min-w-0 text-right text-sm">
                    <span className="font-semibold">{w.pour ? displayPourName(w.pour) : "—"}</span>{" "}
                    <span className="text-xs tabular-nums text-fg-faint">
                      {w.value.toFixed(1)}/{w.max}
                    </span>
                  </dd>
                </div>
              ))}
            </dl>
          </Card>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <Eyebrow>Your recap</Eyebrow>
            {personalRecap ? (
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-2xl bg-sunken px-4 py-4">
                  <div className="text-xs text-fg-faint">Your #1</div>
                  <div className="mt-1 font-semibold">{displayPourName(personalRecap.top.pour)}</div>
                  <div className="mt-1 text-xs text-fg-muted">
                    The group had it {formatRankLabel(personalRecap.topGroupRank)}.
                  </div>
                </div>
                <div className="rounded-2xl bg-sunken px-4 py-4">
                  <div className="text-xs text-fg-faint">You liked it more than the group</div>
                  <div className="mt-1 font-semibold">
                    {personalRecap.higherThanGroup ? displayPourName(personalRecap.higherThanGroup.pour) : "—"}
                  </div>
                  <div className="mt-1 text-xs text-fg-muted">
                    {personalRecap.higherThanGroup
                      ? `${personalRecap.higherThanGroup.delta >= 0 ? "+" : ""}${personalRecap.higherThanGroup.delta.toFixed(1)} vs the group average`
                      : "No scores to compare yet."}
                  </div>
                </div>
                <div className="rounded-2xl bg-sunken px-4 py-4">
                  <div className="text-xs text-fg-faint">Biggest surprise</div>
                  <div className="mt-1 font-semibold">
                    {personalRecap.biggestSurprise ? displayPourName(personalRecap.biggestSurprise.pour) : "—"}
                  </div>
                  <div className="mt-1 text-xs text-fg-muted">
                    {personalRecap.biggestSurprise
                      ? `You: ${formatRankLabel(personalRecap.biggestSurprise.userRank)} · group: ${formatRankLabel(personalRecap.biggestSurprise.groupRank)}`
                      : "No ranking split yet."}
                  </div>
                </div>
                <div className="rounded-2xl bg-sunken px-4 py-4">
                  <div className="text-xs text-fg-faint">Your taste twin tonight</div>
                  <div className="mt-1 font-semibold">{yourTwin ? yourTwin.other.display_name : "—"}</div>
                  <div className="mt-1 text-xs text-fg-muted">
                    {yourTwin
                      ? `${yourTwin.match.meanAbsDiff.toFixed(1)} points apart per pour${
                          yourTwin.match.correlation !== null ? ` · ${matchLabel(yourTwin.match.correlation).toLowerCase()}` : ""
                        }`
                      : "Needs another taster with shared pours."}
                  </div>
                </div>
              </div>
            ) : (
              <p className="mt-3 text-sm text-fg-muted">
                Open this page on the phone you scored with to see how your picks compared.
              </p>
            )}
          </Card>

          <Card>
            <Eyebrow>Most divisive</Eyebrow>
            <div className="mt-3 font-display text-2xl font-semibold">
              {!mostDivisivePour ? "—" : divisiveSpread ? displayPourName(mostDivisivePour.pour) : "Nobody"}
            </div>
            <p className="mt-1 text-sm text-fg-muted">
              {!mostDivisivePour
                ? "Needs at least two scorecards per pour."
                : divisiveSpread
                  ? `Scores spread ±${mostDivisivePour.spread.toFixed(1)} across ${mostDivisivePour.scores.length} tasters.`
                  : "Every taster gave each pour the same total."}
            </p>
          </Card>
        </div>

        {/* Per-taster rankings */}
        <section className="mt-8">
          <Eyebrow>Each taster&apos;s ranking</Eyebrow>
          <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {participants.map((u) => {
              const uStats = perUserRankings[u.id];
              const ranking = uStats?.ranking || [];
              const isYou = u.id === currentParticipantId;

              return (
                <Card key={u.id} padded={false} className={cx(isYou && "border-accent/40")}>
                  <div className="flex items-center gap-3 px-5 pt-5">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft font-display font-semibold text-accent">
                      {u.display_name.charAt(0).toUpperCase()}
                    </span>
                    <span className="min-w-0 truncate font-semibold">
                      {u.display_name}
                      {isYou ? <span className="ml-1.5 text-xs font-normal text-fg-faint">(you)</span> : null}
                    </span>
                  </div>
                  <ol className="mt-3">
                    {ranking.length ? (
                      ranking.map((r) => {
                        const rank = perUserRankMeta[u.id]?.[r.pour.id];
                        const isTop = uStats?.best?.pour.id === r.pour.id;
                        const isBottom = uStats?.least?.pour.id === r.pour.id && ranking.length > 1;
                        return (
                          <li
                            key={`${u.id}-${r.pour.id}`}
                            className="flex items-center justify-between gap-3 border-t border-line px-5 py-2.5"
                          >
                            <span className="flex min-w-0 items-center gap-3">
                              <span className="w-14 shrink-0 text-[11px] font-bold text-fg-faint">
                                {formatRankLabel(rank)}
                              </span>
                              <span
                                className={cx(
                                  "truncate text-sm font-semibold",
                                  isTop ? "text-success" : isBottom ? "text-danger" : "text-fg",
                                )}
                              >
                                {displayPourName(r.pour)}
                              </span>
                            </span>
                            <span className="shrink-0 text-sm font-bold tabular-nums">
                              {r.total.toFixed(0)}
                              <span className="text-xs font-normal text-fg-faint">/100</span>
                            </span>
                          </li>
                        );
                      })
                    ) : (
                      <li className="border-t border-line px-5 py-3 text-sm text-fg-muted">No scores from this taster.</li>
                    )}
                  </ol>
                </Card>
              );
            })}
          </div>
        </section>

        <div className="mt-8 flex justify-center">
          <Button variant="secondary" onClick={() => setCinematicStep(0)}>
            <Play className="h-4 w-4" /> Replay the reveal
          </Button>
        </div>
      </PageShell>
    );
  }

  // ---------- Cinematic pour screen (built for a TV) ----------
  const ps = activeCinematic;
  const activeGuessSummary =
    ps && guesses.length ? pourGuessSummary(ps.pour, participants, guesses) : null;

  const placeMeta = ps ? pourRankMeta[ps.pour.id] : null;
  const placeFromTop = placeMeta?.rank ?? 0;
  const isWinner = placeFromTop === 1 && pours.length > 0;
  const totalPlaces = Math.max(0, pours.length);

  return (
    <main className="flex min-h-dvh flex-col bg-canvas px-4 pb-6 text-fg sm:px-8" style={{ paddingTop: "max(1.25rem, env(safe-area-inset-top))" }}>
      <ConnectionBanner />

      <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4">
        <div className="min-w-0">
          <Wordmark />
          <div className="truncate text-xs text-fg-faint">{title}</div>
        </div>
        <div className="flex items-center gap-1.5" aria-label={`Step ${cinematicStep + 1} of ${stepCount}`}>
          {Array.from({ length: stepCount }).map((_, i) => (
            <span
              key={i}
              className={cx(
                "h-1.5 rounded-full transition-all",
                i === cinematicStep ? "w-6 bg-accent" : i < cinematicStep ? "w-1.5 bg-accent/50" : "w-1.5 bg-line-strong",
              )}
            />
          ))}
        </div>
      </header>

      <div key={cinematicStep} className="mx-auto mt-8 w-full max-w-6xl flex-1 animate-fade-slide-in">
        <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div className="min-w-0">
            <div
              className={cx(
                "inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm font-bold",
                isWinner ? "border-accent bg-accent text-on-accent" : "border-line-strong text-fg-muted",
              )}
            >
              {isWinner ? <Trophy className="h-4 w-4" /> : null}
              {isWinner
                ? placeMeta?.tied
                  ? "Tied for the win"
                  : "The winner"
                : placeMeta?.tied
                  ? `Tied for ${formatOrdinal(placeFromTop)} of ${totalPlaces}`
                  : `${placeFromTop ? formatOrdinal(placeFromTop) : "—"} of ${totalPlaces}`}
            </div>
            <h1
              className={cx(
                "mt-4 font-display font-semibold leading-[1.05] tracking-tight",
                isWinner ? "text-5xl text-accent sm:text-6xl md:text-8xl" : "text-4xl sm:text-5xl md:text-7xl",
              )}
            >
              {ps ? displayPourName(ps.pour) : "—"}
            </h1>
            {ps && (pourSubtitle(ps.pour) || pourFacts(ps.pour)) ? (
              <div className="mt-2 text-lg text-fg-muted">
                {[pourSubtitle(ps.pour), pourFacts(ps.pour)].filter(Boolean).join(" · ")}
              </div>
            ) : null}
          </div>

          <div className="shrink-0 md:text-right">
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-fg-faint">Average score</div>
            <div className="font-display text-6xl font-semibold tabular-nums md:text-7xl">
              {ps ? ps.avgTotal.toFixed(1) : "0.0"}
            </div>
            <div className="text-sm text-fg-faint">out of 100 · {ps ? ps.count : 0} scorecards</div>
          </div>
        </div>

        <div className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-5">
          {CATEGORY.map((c) => {
            const v = ps ? clamp01(ps.avgByCat[c.key] ?? 0) : 0;
            const colors = scoreColor(v, c.max);

            return (
              <div key={c.key} className="rounded-2xl border border-line bg-surface p-4">
                <div className="text-xs text-fg-muted">{c.label}</div>
                <div className={cx("mt-1 text-2xl font-bold tabular-nums", colors.text, colors.glow)}>
                  {v.toFixed(1)}
                  <span className="text-xs font-semibold text-fg-faint">/{c.max}</span>
                </div>
                <div className="mt-2 h-1 overflow-hidden rounded-full bg-sunken">
                  <div className={cx("h-full rounded-full", colors.bar)} style={{ width: `${ratio(v, c.max) * 100}%` }} />
                </div>
              </div>
            );
          })}
        </div>

        {shoutoutChipsForPour.length ? (
          <div className="mt-6 flex flex-wrap gap-2">
            {shoutoutChipsForPour.map((c, i) => (
              <span key={`${i}-${c.text}`} className={chipClass(c.kind)}>
                {c.text}
              </span>
            ))}
          </div>
        ) : null}

        {ps && tagsByPour[ps.pour.id]?.length ? (
          <div className="mt-6">
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-fg-faint">The table tasted</div>
            <FlavorTagList tags={tagsByPour[ps.pour.id].slice(0, 10)} className="mt-2" />
          </div>
        ) : null}

        {ps && activeGuessSummary ? (
          <div className="mt-6 flex flex-wrap gap-2">
            {activeGuessSummary.bottleGuessers ? (
              <span className={chipClass(activeGuessSummary.correctNames.length ? "best" : "least")}>
                <Target className="mr-1.5 h-3.5 w-3.5" />
                {activeGuessSummary.correctNames.length
                  ? `Guessed it: ${activeGuessSummary.correctNames.join(", ")}`
                  : `Nobody guessed it (${activeGuessSummary.bottleGuessers} tried)`}
              </span>
            ) : null}
            {activeGuessSummary.closestProof ? (
              <span className="inline-flex items-center rounded-full border border-line-strong px-3 py-1 text-xs font-semibold text-fg-muted">
                Closest proof: {activeGuessSummary.closestProof.name} ({activeGuessSummary.closestProof.guess})
              </span>
            ) : null}
            {activeGuessSummary.closestPrice ? (
              <span className="inline-flex items-center rounded-full border border-line-strong px-3 py-1 text-xs font-semibold text-fg-muted">
                Closest price: {activeGuessSummary.closestPrice.name} (${activeGuessSummary.closestPrice.guess})
              </span>
            ) : null}
          </div>
        ) : null}

        {notesForActivePour.length ? (
          <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-2">
            {notesForActivePour.map((row, idx) => (
              <figure key={`${row.participantName}-${idx}`} className="rounded-2xl border border-line bg-surface p-4">
                <blockquote className="font-display text-lg leading-snug text-fg">“{row.notes}”</blockquote>
                <figcaption className="mt-2 text-xs font-semibold text-fg-faint">{row.participantName}</figcaption>
              </figure>
            ))}
          </div>
        ) : null}
      </div>

      <div className="mx-auto mt-8 flex w-full max-w-6xl items-center justify-between gap-2">
        <Button
          variant="secondary"
          size="lg"
          onClick={() => setCinematicStep((s) => Math.max(0, s - 1))}
          disabled={cinematicStep === 0}
          aria-label="Previous"
        >
          <ChevronLeft className="h-5 w-5" /> <span className="hidden sm:inline">Back</span>
        </Button>

        <Button variant="ghost" onClick={() => setCinematicStep(cinematicList.length)}>
          <SkipForward className="h-4 w-4" /> Skip to results
        </Button>

        <Button variant="primary" size="lg" onClick={() => setCinematicStep((s) => Math.min(cinematicList.length, s + 1))}>
          {cinematicStep >= cinematicList.length - 1 ? "Final results" : "Next"} <ChevronRight className="h-5 w-5" />
        </Button>
      </div>
      <p className="mt-3 hidden text-center text-xs text-fg-faint md:block">
        Revealing from last place to first. Arrow keys, space, or a presentation clicker work too.
      </p>
    </main>
  );
}
