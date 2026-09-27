import { describe, expect, it } from "vitest";
import { buildPalateProfile, matchLabel, proofBand, summarizeMatches, type PalateEntry } from "./profile";

const entry = (over: Partial<PalateEntry>): PalateEntry => ({
  source: "blind",
  id: Math.random().toString(36).slice(2),
  total: 70,
  created_at: "2026-09-01",
  ...over,
});

describe("buildPalateProfile", () => {
  it("finds the proof sweet spot, style, and distillery with enough pours", () => {
    const profile = buildPalateProfile([
      entry({ total: 90, proof: 125, subcategory: "BOURBON", distillery: "Buffalo Trace" }),
      entry({ total: 88, proof: 128, subcategory: "bourbon", distillery: "Buffalo Trace" }),
      entry({ total: 70, proof: 90, subcategory: "rye", distillery: "Wild Turkey" }),
      entry({ total: 72, proof: 94, subcategory: "rye", distillery: "Wild Turkey" }),
      entry({ total: 99, proof: 140 }),
    ]);
    expect(profile.proofSweetSpot).toMatchObject({ label: "120–129 proof", count: 2, average: 89 });
    expect(profile.favoriteStyle).toMatchObject({ label: "Bourbon", count: 2 });
    expect(profile.favoriteDistillery?.label).toBe("Buffalo Trace");
  });

  it("stays quiet with too little data", () => {
    const profile = buildPalateProfile([entry({ proof: 100 }), entry({ proof: 100 })]);
    expect(profile.proofSweetSpot).toBeNull();
    expect(profile.generosity).toBeNull();
    expect(profile.strongestCategory).toBeNull();
  });

  it("measures generosity against the table on blind pours only", () => {
    const profile = buildPalateProfile([
      entry({ total: 80, table_avg: 75 }),
      entry({ total: 70, table_avg: 66 }),
      entry({ total: 60, table_avg: 54 }),
      entry({ source: "rate", total: 99, table_avg: null }),
    ]);
    expect(profile.generosity).toEqual({ delta: 5, pours: 3 });
  });

  it("ranks categories by share of max and counts tags", () => {
    const profile = buildPalateProfile([
      entry({ total: 95, by_cat: { nose: 9, finish: 5, packaging: 5 }, tags: ["caramel", "oak"] }),
      entry({ total: 60, by_cat: { nose: 8, finish: 4, packaging: 5 }, tags: ["oak"] }),
      entry({ total: 50, by_cat: { nose: "7", finish: 3 }, tags: ["Caramel"] }),
    ]);
    expect(profile.strongestCategory?.key).toBe("nose");
    expect(profile.weakestCategory?.key).toBe("finish");
    expect(profile.topTags[0]).toEqual({ tag: "caramel", count: 2 });
    expect(profile.favoriteTags.map((t) => t.tag).sort()).toEqual(["caramel", "oak"]);
  });
});

describe("palate matches", () => {
  it("picks the twin and the opposite", () => {
    const { twin, opposite, matches } = summarizeMatches([
      { who: "a", name: "Bea", shared: 5, correlation: "0.91", mean_abs_diff: 3 },
      { who: "b", name: "Sam", shared: 4, correlation: -0.6, mean_abs_diff: 15 },
      { who: "c", name: "Flat", shared: 3, correlation: null, mean_abs_diff: 0 },
    ]);
    expect(matches).toHaveLength(2);
    expect(twin?.name).toBe("Bea");
    expect(opposite?.name).toBe("Sam");
    expect(matchLabel(0.91)).toBe("Nearly identical taste");
    expect(matchLabel(-0.6)).toBe("Opposite taste");
  });

  it("bands proof", () => {
    expect(proofBand(89.9)).toBe("Under 90 proof");
    expect(proofBand(100)).toBe("100–109 proof");
    expect(proofBand(150)).toBe("130+ proof");
  });
});
