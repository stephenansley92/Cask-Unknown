import { describe, expect, it } from "vitest";
import {
  contrarian,
  correlation,
  giantKiller,
  guessLeaderboard,
  pairMatches,
  pourGuessSummary,
  pourPrice,
  sameBottle,
  scoreGuess,
  tasteTwins,
  twinFor,
  valueRows,
} from "./insights";

const people = [
  { id: "al", display_name: "Al" },
  { id: "bea", display_name: "Bea" },
  { id: "sam", display_name: "Sam" },
];

const table = (rows: Record<string, number[]>) =>
  Object.entries(rows).flatMap(([participant_id, totals]) =>
    totals.map((total, i) => ({ participant_id, pour_id: `p${i}`, total })),
  );

describe("correlation", () => {
  it("is 1 for identical orderings and -1 for reversed", () => {
    expect(correlation([1, 2, 3], [10, 20, 30])).toBeCloseTo(1);
    expect(correlation([1, 2, 3], [30, 20, 10])).toBeCloseTo(-1);
  });

  it("is null without variance", () => {
    expect(correlation([5, 5, 5], [1, 2, 3])).toBeNull();
  });
});

describe("palate match", () => {
  const scores = table({ al: [80, 60, 70], bea: [78, 58, 72], sam: [50, 75, 60] });

  it("pairs the closest palates", () => {
    const pairs = pairMatches(people, scores);
    const twins = tasteTwins(pairs)!;
    expect([twins.a.id, twins.b.id].sort()).toEqual(["al", "bea"]);
    expect(twins.correlation).toBeGreaterThan(0.9);
  });

  it("finds a personal twin", () => {
    const pairs = pairMatches(people, scores);
    expect(twinFor("sam", pairs)?.other.id).toBeDefined();
    expect(twinFor("al", pairs)?.other.id).toBe("bea");
  });

  it("skips correlation below three shared pours but still measures distance", () => {
    const pairs = pairMatches(people, table({ al: [80, 60], bea: [70, 65] }));
    expect(pairs).toHaveLength(1);
    expect(pairs[0].correlation).toBeNull();
    expect(pairs[0].meanAbsDiff).toBe(7.5);
  });

  it("names the contrarian", () => {
    const c = contrarian(people, scores)!;
    expect(c.participant.id).toBe("sam");
    expect(c.offBy).toBeGreaterThan(10);
  });

  it("needs three tasters for a contrarian", () => {
    expect(contrarian(people.slice(0, 2), scores)).toBeNull();
  });
});

describe("value picks", () => {
  it("prefers MSRP and falls back to secondary", () => {
    expect(pourPrice({ msrp: 40, secondary: 90 })).toBe(40);
    expect(pourPrice({ msrp: null, secondary: "90" })).toBe(90);
    expect(pourPrice({ msrp: 0 })).toBeNull();
  });

  it("ranks by points per ten dollars and finds a giant killer", () => {
    const rows = valueRows([
      { id: "bt", name: "Buffalo Trace", avgTotal: 82, msrp: 30 },
      { id: "stagg", name: "Stagg", avgTotal: 78, msrp: 60, secondary: 250 },
      { id: "wt", name: "Wild Turkey", avgTotal: 70, msrp: 25 },
      { id: "mystery", name: "No price", avgTotal: 90 },
    ]);
    expect(rows.map((r) => r.id)).toEqual(["wt", "bt", "stagg"]);
    const gk = giantKiller(rows)!;
    expect(gk.winner.id).toBe("bt");
    expect(gk.beat.id).toBe("stagg");
    expect(gk.priceRatio).toBe(2);
  });

  it("has no giant killer when the pricey bottle wins", () => {
    const rows = valueRows([
      { id: "a", name: "A", avgTotal: 70, msrp: 20 },
      { id: "b", name: "B", avgTotal: 90, msrp: 100 },
    ]);
    expect(giantKiller(rows)).toBeNull();
  });
});

describe("guessing game", () => {
  const pours = [
    { id: "p0", bottle_name: "Buffalo Trace", proof: 90, msrp: 30 },
    { id: "p1", bottle_name: "Stagg", proof: 130, msrp: 60 },
  ];

  it("matches bottle names loosely", () => {
    expect(sameBottle(" buffalo  trace", "Buffalo Trace")).toBe(true);
    expect(sameBottle("", "")).toBe(false);
  });

  it("awards points for bottle, proof, and price", () => {
    const perfect = scoreGuess({ pour_id: "p0", participant_id: "al", bottle_guess: "Buffalo Trace", proof_guess: 91, price_guess: 32 }, pours[0]);
    expect(perfect.points).toBe(3 + 2 + 2);
    const close = scoreGuess({ pour_id: "p1", participant_id: "al", bottle_guess: "Buffalo Trace", proof_guess: "125", price_guess: 72 }, pours[1]);
    expect(close.bottleCorrect).toBe(false);
    expect(close.points).toBe(0 + 1 + 1);
    const empty = scoreGuess({ pour_id: "p1", participant_id: "al" }, pours[1]);
    expect(empty).toMatchObject({ bottleCorrect: null, proofDiff: null, priceDiffPct: null, points: 0 });
  });

  it("builds a leaderboard and per-pour summary", () => {
    const guesses = [
      { pour_id: "p0", participant_id: "al", bottle_guess: "Buffalo Trace", proof_guess: 100 },
      { pour_id: "p1", participant_id: "al", bottle_guess: "Stagg" },
      { pour_id: "p0", participant_id: "bea", bottle_guess: "Stagg", proof_guess: 92 },
      { pour_id: "p1", participant_id: "bea", bottle_guess: "Buffalo Trace", price_guess: 58 },
    ];
    const board = guessLeaderboard(people, pours, guesses);
    expect(board.map((r) => r.participant.id)).toEqual(["al", "bea"]);
    expect(board[0]).toMatchObject({ points: 6, bottlesCorrect: 2, bottlesGuessed: 2 });
    expect(board.find((r) => r.participant.id === "sam")).toBeUndefined();

    const p0 = pourGuessSummary(pours[0], people, guesses);
    expect(p0.correctNames).toEqual(["Al"]);
    expect(p0.closestProof).toEqual({ name: "Bea", guess: 92, diff: 2 });
    expect(p0.closestPrice).toBeNull();
  });
});
