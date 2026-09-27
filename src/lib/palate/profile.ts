// Turns the rows from get_my_palate() into a short "your palate" summary.
import { countFlavorTags } from "@/lib/flavor-tags";

export type PalateEntry = {
  source: "blind" | "rate";
  id: string;
  total: number | string;
  created_at: string;
  name?: string | null;
  whiskey_id?: string | null;
  by_cat?: Record<string, number | string | null> | null;
  tags?: string[] | null;
  proof?: number | string | null;
  distillery?: string | null;
  category?: string | null;
  subcategory?: string | null;
  msrp?: number | string | null;
  table_avg?: number | string | null;
};

export type PalateMatchRow = {
  who: string;
  user_id?: string | null;
  name: string;
  shared: number;
  correlation: number | string | null;
  mean_abs_diff: number | string | null;
};

export const CATEGORY_MAX: Record<string, number> = {
  nose: 10,
  flavor: 20,
  mouthfeel: 10,
  complexity: 10,
  balance: 10,
  finish: 10,
  uniqueness: 10,
  drinkability: 10,
  packaging: 5,
  value: 5,
};

const CATEGORY_LABEL: Record<string, string> = {
  nose: "Nose",
  flavor: "Palate",
  mouthfeel: "Mouthfeel",
  complexity: "Complexity",
  balance: "Balance",
  finish: "Finish",
  uniqueness: "Uniqueness",
  drinkability: "Drinkability",
  packaging: "Packaging",
  value: "Value",
};

export const PROOF_BANDS = [
  { label: "Under 90 proof", min: 0, max: 90 },
  { label: "90–99 proof", min: 90, max: 100 },
  { label: "100–109 proof", min: 100, max: 110 },
  { label: "110–119 proof", min: 110, max: 120 },
  { label: "120–129 proof", min: 120, max: 130 },
  { label: "130+ proof", min: 130, max: Infinity },
] as const;

/** A group only counts once it has this many pours. */
export const MIN_GROUP_SIZE = 2;

function num(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;

export type GroupStat = { label: string; average: number; count: number };

/** Best-scoring group by key, among groups with enough pours. Needs 2+ groups to be meaningful. */
function bestGroup(entries: PalateEntry[], keyOf: (e: PalateEntry) => string | null): GroupStat | null {
  const groups = new Map<string, number[]>();
  for (const e of entries) {
    const key = keyOf(e);
    const total = num(e.total);
    if (!key || total === null) continue;
    groups.set(key, [...(groups.get(key) ?? []), total]);
  }
  const eligible = [...groups.entries()]
    .filter(([, totals]) => totals.length >= MIN_GROUP_SIZE)
    .map(([label, totals]) => ({ label, average: mean(totals), count: totals.length }));
  if (eligible.length < 2) return null;
  return eligible.sort((a, b) => b.average - a.average || b.count - a.count)[0];
}

export function proofBand(proof: number) {
  return PROOF_BANDS.find((b) => proof >= b.min && proof < b.max)?.label ?? null;
}

function titleCase(value: string) {
  return value.replace(/\b\w/g, (c) => c.toUpperCase());
}

export type PalateProfile = {
  count: number;
  proofSweetSpot: GroupStat | null;
  favoriteStyle: GroupStat | null;
  favoriteDistillery: GroupStat | null;
  strongestCategory: { key: string; label: string; pct: number } | null;
  weakestCategory: { key: string; label: string; pct: number } | null;
  /** Your score minus the rest of the table's average, over blind pours. */
  generosity: { delta: number; pours: number } | null;
  topTags: { tag: string; count: number }[];
  /** Tags that show up most on the pours you rated highest. */
  favoriteTags: { tag: string; count: number }[];
};

export function buildPalateProfile(entries: PalateEntry[]): PalateProfile {
  const proofSweetSpot = bestGroup(entries, (e) => {
    const proof = num(e.proof);
    return proof === null ? null : proofBand(proof);
  });
  const favoriteStyle = bestGroup(entries, (e) => {
    const style = (e.subcategory || e.category || "").trim();
    return style ? titleCase(style.toLowerCase()) : null;
  });
  const favoriteDistillery = bestGroup(entries, (e) => (e.distillery || "").trim() || null);

  const pctByCategory = new Map<string, number[]>();
  for (const e of entries) {
    for (const [key, raw] of Object.entries(e.by_cat ?? {})) {
      const max = CATEGORY_MAX[key];
      const value = num(raw);
      if (!max || value === null) continue;
      pctByCategory.set(key, [...(pctByCategory.get(key) ?? []), value / max]);
    }
  }
  const categoryAverages = [...pctByCategory.entries()]
    .filter(([key, values]) => values.length >= MIN_GROUP_SIZE && key !== "packaging" && key !== "value")
    .map(([key, values]) => ({ key, label: CATEGORY_LABEL[key] ?? key, pct: mean(values) }))
    .sort((a, b) => b.pct - a.pct);

  const deltas = entries
    .filter((e) => e.source === "blind")
    .map((e) => {
      const total = num(e.total);
      const tableAvg = num(e.table_avg);
      return total === null || tableAvg === null ? null : total - tableAvg;
    })
    .filter((d): d is number => d !== null);

  const totals = entries.map((e) => num(e.total)).filter((t): t is number => t !== null).sort((a, b) => b - a);
  const topCut = totals.length ? totals[Math.max(0, Math.ceil(totals.length / 4) - 1)] : Infinity;

  return {
    count: entries.length,
    proofSweetSpot,
    favoriteStyle,
    favoriteDistillery,
    strongestCategory: categoryAverages.length >= 2 ? categoryAverages[0] : null,
    weakestCategory: categoryAverages.length >= 2 ? categoryAverages[categoryAverages.length - 1] : null,
    generosity: deltas.length >= 3 ? { delta: mean(deltas), pours: deltas.length } : null,
    topTags: countFlavorTags(entries.map((e) => e.tags)).slice(0, 8),
    favoriteTags: countFlavorTags(
      entries.filter((e) => (num(e.total) ?? -Infinity) >= topCut).map((e) => e.tags),
    ).slice(0, 5),
  };
}

export type PalateMatch = { name: string; userId: string | null; shared: number; correlation: number; pointsApart: number };

/** Most and least similar tasters from get_my_palate().matches. */
export function summarizeMatches(rows: PalateMatchRow[]) {
  const matches: PalateMatch[] = rows
    .map((r) => ({
      name: r.name,
      userId: r.user_id ?? null,
      shared: Number(r.shared) || 0,
      correlation: num(r.correlation),
      pointsApart: num(r.mean_abs_diff) ?? 0,
    }))
    .filter((m): m is PalateMatch => m.correlation !== null)
    .sort((a, b) => b.correlation - a.correlation || a.pointsApart - b.pointsApart);

  return {
    matches,
    twin: matches[0] ?? null,
    opposite: matches.length >= 2 ? matches[matches.length - 1] : null,
  };
}

/** Plain-language label for a correlation. */
export function matchLabel(r: number) {
  if (r >= 0.8) return "Nearly identical taste";
  if (r >= 0.5) return "Very similar taste";
  if (r >= 0.2) return "Somewhat similar";
  if (r > -0.2) return "No real pattern";
  if (r > -0.5) return "Different taste";
  return "Opposite taste";
}
