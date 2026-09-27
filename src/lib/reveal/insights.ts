// Pure reveal-night calculations: palate match, value picks, and the
// guessing game. Kept out of the page so they can be unit tested.

export type InsightScore = { participant_id: string; pour_id: string; total: number };
export type InsightParticipant = { id: string; display_name: string };

// ── Palate match ─────────────────────────────────────────────────────────

/** Pearson correlation; null when either side has no variance. */
export function correlation(xs: number[], ys: number[]): number | null {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return null;
  const mx = xs.slice(0, n).reduce((a, b) => a + b, 0) / n;
  const my = ys.slice(0, n).reduce((a, b) => a + b, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx;
    const dy = ys[i] - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  if (sxx === 0 || syy === 0) return null;
  return sxy / Math.sqrt(sxx * syy);
}

export type PairMatch = {
  a: InsightParticipant;
  b: InsightParticipant;
  shared: number;
  /** Pearson r over shared pours; needs 3+ shared pours with some spread. */
  correlation: number | null;
  /** Average points apart on the same pour. */
  meanAbsDiff: number;
};

export const MIN_SHARED_FOR_CORRELATION = 3;

export function pairMatches(participants: InsightParticipant[], scores: InsightScore[]): PairMatch[] {
  const byParticipant = new Map<string, Map<string, number>>();
  for (const s of scores) {
    const totals = byParticipant.get(s.participant_id) ?? new Map<string, number>();
    totals.set(s.pour_id, Number(s.total) || 0);
    byParticipant.set(s.participant_id, totals);
  }

  const out: PairMatch[] = [];
  for (let i = 0; i < participants.length; i++) {
    for (let j = i + 1; j < participants.length; j++) {
      const a = participants[i];
      const b = participants[j];
      const ta = byParticipant.get(a.id);
      const tb = byParticipant.get(b.id);
      if (!ta || !tb) continue;
      const xs: number[] = [];
      const ys: number[] = [];
      for (const [pourId, total] of ta) {
        const other = tb.get(pourId);
        if (other === undefined) continue;
        xs.push(total);
        ys.push(other);
      }
      if (xs.length < 2) continue;
      const meanAbsDiff = xs.reduce((sum, x, k) => sum + Math.abs(x - ys[k]), 0) / xs.length;
      out.push({
        a,
        b,
        shared: xs.length,
        correlation: xs.length >= MIN_SHARED_FOR_CORRELATION ? correlation(xs, ys) : null,
        meanAbsDiff,
      });
    }
  }
  return out;
}

/** Closer palates sort first: higher correlation, then fewer points apart. */
export function compareMatches(x: PairMatch, y: PairMatch) {
  const cx = x.correlation ?? -2;
  const cy = y.correlation ?? -2;
  if (cx !== cy) return cy - cx;
  return x.meanAbsDiff - y.meanAbsDiff;
}

export function tasteTwins(pairs: PairMatch[]): PairMatch | null {
  return [...pairs].sort(compareMatches)[0] ?? null;
}

/** The closest palate to one taster. */
export function twinFor(participantId: string, pairs: PairMatch[]) {
  const mine = pairs.filter((p) => p.a.id === participantId || p.b.id === participantId);
  const best = [...mine].sort(compareMatches)[0];
  if (!best) return null;
  return { other: best.a.id === participantId ? best.b : best.a, match: best };
}

export type Contrarian = { participant: InsightParticipant; offBy: number; pours: number };

/**
 * The taster who strayed furthest from everyone else: average points between
 * their score and the rest of the table's average on the same pour. Needs at
 * least three tasters so "the rest of the table" means something.
 */
export function contrarian(participants: InsightParticipant[], scores: InsightScore[]): Contrarian | null {
  if (participants.length < 3) return null;
  const byPour = new Map<string, InsightScore[]>();
  for (const s of scores) {
    const list = byPour.get(s.pour_id) ?? [];
    list.push(s);
    byPour.set(s.pour_id, list);
  }

  let best: Contrarian | null = null;
  for (const p of participants) {
    let sum = 0;
    let n = 0;
    for (const list of byPour.values()) {
      const mine = list.find((s) => s.participant_id === p.id);
      const others = list.filter((s) => s.participant_id !== p.id);
      if (!mine || others.length === 0) continue;
      const othersAvg = others.reduce((a, s) => a + (Number(s.total) || 0), 0) / others.length;
      sum += Math.abs((Number(mine.total) || 0) - othersAvg);
      n += 1;
    }
    if (n === 0) continue;
    const offBy = sum / n;
    if (!best || offBy > best.offBy) best = { participant: p, offBy, pours: n };
  }
  return best;
}

// ── Value picks ──────────────────────────────────────────────────────────

export type ValuePour = { id: string; name: string; avgTotal: number; msrp?: number | null; secondary?: number | null };

export type ValueRow = { id: string; name: string; avgTotal: number; price: number; pointsPerTenDollars: number };

/** Retail first; fall back to the secondary price when there is no MSRP. */
export function pourPrice(p: { msrp?: number | string | null; secondary?: number | string | null }) {
  const msrp = Number(p.msrp);
  if (Number.isFinite(msrp) && msrp > 0) return msrp;
  const secondary = Number(p.secondary);
  if (Number.isFinite(secondary) && secondary > 0) return secondary;
  return null;
}

export function valueRows(pours: ValuePour[]): ValueRow[] {
  return pours
    .map((p) => ({ p, price: pourPrice(p) }))
    .filter((x): x is { p: ValuePour; price: number } => x.price !== null && x.p.avgTotal > 0)
    .map(({ p, price }) => ({
      id: p.id,
      name: p.name,
      avgTotal: p.avgTotal,
      price,
      pointsPerTenDollars: (p.avgTotal / price) * 10,
    }))
    .sort((a, b) => b.pointsPerTenDollars - a.pointsPerTenDollars);
}

export type GiantKiller = { winner: ValueRow; beat: ValueRow; priceRatio: number };

/**
 * The cheapest bottle that outscored a much pricier one (at least 1.5× its
 * price), choosing the most lopsided price gap.
 */
export function giantKiller(rows: ValueRow[]): GiantKiller | null {
  let best: GiantKiller | null = null;
  for (const cheap of rows) {
    for (const pricey of rows) {
      if (cheap.id === pricey.id) continue;
      if (cheap.avgTotal <= pricey.avgTotal) continue;
      const priceRatio = pricey.price / cheap.price;
      if (priceRatio < 1.5) continue;
      if (!best || priceRatio > best.priceRatio) best = { winner: cheap, beat: pricey, priceRatio };
    }
  }
  return best;
}

// ── Guessing game ────────────────────────────────────────────────────────

export type Guess = {
  pour_id: string;
  participant_id: string;
  bottle_guess?: string | null;
  proof_guess?: number | string | null;
  price_guess?: number | string | null;
};

export type GuessPour = {
  id: string;
  bottle_name?: string | null;
  proof?: number | string | null;
  msrp?: number | string | null;
  secondary?: number | string | null;
};

export const GUESS_POINTS = {
  bottle: 3,
  proofExact: 2, // within 2 proof
  proofClose: 1, // within 5 proof
  priceExact: 2, // within 10%
  priceClose: 1, // within 25%
} as const;

function num(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function sameBottle(a?: string | null, b?: string | null) {
  const norm = (s?: string | null) => (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  return Boolean(norm(a)) && norm(a) === norm(b);
}

export type ScoredGuess = {
  guess: Guess;
  bottleCorrect: boolean | null;
  proofDiff: number | null;
  priceDiffPct: number | null;
  points: number;
};

export function scoreGuess(guess: Guess, pour: GuessPour | undefined): ScoredGuess {
  let points = 0;

  let bottleCorrect: boolean | null = null;
  if (guess.bottle_guess && pour?.bottle_name) {
    bottleCorrect = sameBottle(guess.bottle_guess, pour.bottle_name);
    if (bottleCorrect) points += GUESS_POINTS.bottle;
  }

  let proofDiff: number | null = null;
  const proofGuess = num(guess.proof_guess);
  const proofActual = num(pour?.proof);
  if (proofGuess !== null && proofActual !== null) {
    proofDiff = Math.abs(proofGuess - proofActual);
    if (proofDiff <= 2) points += GUESS_POINTS.proofExact;
    else if (proofDiff <= 5) points += GUESS_POINTS.proofClose;
  }

  let priceDiffPct: number | null = null;
  const priceGuess = num(guess.price_guess);
  const priceActual = pour ? pourPrice(pour) : null;
  if (priceGuess !== null && priceActual !== null) {
    priceDiffPct = Math.abs(priceGuess - priceActual) / priceActual;
    if (priceDiffPct <= 0.1) points += GUESS_POINTS.priceExact;
    else if (priceDiffPct <= 0.25) points += GUESS_POINTS.priceClose;
  }

  return { guess, bottleCorrect, proofDiff, priceDiffPct, points };
}

export type GuessStanding = {
  participant: InsightParticipant;
  points: number;
  bottlesCorrect: number;
  bottlesGuessed: number;
  guesses: number;
};

export function guessLeaderboard(
  participants: InsightParticipant[],
  pours: GuessPour[],
  guesses: Guess[],
): GuessStanding[] {
  const pourById = new Map(pours.map((p) => [p.id, p]));
  return participants
    .map((participant) => {
      const mine = guesses.filter((g) => g.participant_id === participant.id);
      const scored = mine.map((g) => scoreGuess(g, pourById.get(g.pour_id)));
      return {
        participant,
        points: scored.reduce((sum, s) => sum + s.points, 0),
        bottlesCorrect: scored.filter((s) => s.bottleCorrect === true).length,
        bottlesGuessed: scored.filter((s) => s.bottleCorrect !== null).length,
        guesses: mine.length,
      };
    })
    .filter((row) => row.guesses > 0)
    .sort((a, b) => b.points - a.points || b.bottlesCorrect - a.bottlesCorrect);
}

export type PourGuessSummary = {
  correctNames: string[];
  bottleGuessers: number;
  closestProof: { name: string; guess: number; diff: number } | null;
  closestPrice: { name: string; guess: number; diffPct: number } | null;
};

export function pourGuessSummary(
  pour: GuessPour,
  participants: InsightParticipant[],
  guesses: Guess[],
): PourGuessSummary {
  const nameOf = new Map(participants.map((p) => [p.id, p.display_name]));
  const scored = guesses.filter((g) => g.pour_id === pour.id).map((g) => scoreGuess(g, pour));

  const correctNames = scored
    .filter((s) => s.bottleCorrect === true)
    .map((s) => nameOf.get(s.guess.participant_id) ?? "Someone");

  const proofs = scored.filter((s) => s.proofDiff !== null).sort((a, b) => a.proofDiff! - b.proofDiff!);
  const prices = scored.filter((s) => s.priceDiffPct !== null).sort((a, b) => a.priceDiffPct! - b.priceDiffPct!);

  return {
    correctNames,
    bottleGuessers: scored.filter((s) => s.bottleCorrect !== null).length,
    closestProof: proofs[0]
      ? {
          name: nameOf.get(proofs[0].guess.participant_id) ?? "Someone",
          guess: Number(proofs[0].guess.proof_guess),
          diff: proofs[0].proofDiff!,
        }
      : null,
    closestPrice: prices[0]
      ? {
          name: nameOf.get(prices[0].guess.participant_id) ?? "Someone",
          guess: Number(prices[0].guess.price_guess),
          diffPct: prices[0].priceDiffPct!,
        }
      : null,
  };
}
