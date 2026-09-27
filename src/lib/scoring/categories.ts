// Scoring categories for the 100-point tasting model.
// 0 allowed everywhere
export const CATEGORY_SPEC = [
  {
    key: "nose",
    label: "Nose",
    min: 0,
    max: 10,
    group: "core",
    description: "How appealing the aroma is before you sip.",
    examples: "Examples: vanilla, caramel, oak, fruit, baking spice",
  },
  {
    key: "flavor",
    label: "Flavor",
    min: 0,
    max: 20,
    group: "core",
    description: "How much you enjoy the taste on the palate.",
    examples: "Examples: toffee, cherry, cinnamon, peanut, dark chocolate",
  },
  {
    key: "mouthfeel",
    label: "Mouthfeel",
    min: 0,
    max: 10,
    group: "core",
    description: "Texture and body in the mouth.",
    examples: "Examples: oily, creamy, silky, thin, hot",
  },
  {
    key: "complexity",
    label: "Complexity",
    min: 0,
    max: 10,
    group: "core",
    description: "How layered, interesting, and evolving it feels.",
    examples: "Examples: changing notes, depth, new flavors on revisit",
  },
  {
    key: "balance",
    label: "Balance",
    min: 0,
    max: 10,
    group: "core",
    description: "How well the sweetness, oak, proof, and spice fit together.",
    examples: "Examples: integrated, harmonious, not too sweet, not too sharp",
  },
  {
    key: "finish",
    label: "Finish",
    min: 0,
    max: 10,
    group: "core",
    description: "How pleasant and lasting the aftertaste is.",
    examples: "Examples: long, warm, drying, lingering spice, clean fade",
  },
  {
    key: "uniqueness",
    label: "Uniqueness",
    min: 0,
    max: 10,
    group: "core",
    description: "How distinctive or memorable it is versus the rest of the flight.",
    examples: "Examples: unusual profile, standout note, memorable finish",
  },
  {
    key: "drinkability",
    label: "Drinkability",
    min: 0,
    max: 10,
    group: "core",
    description: "How easy it is to keep sipping and enjoy.",
    examples: "Examples: approachable, smooth, easy to revisit, not harsh",
  },

  // unlocked at reveal_ready + revealed
  {
    key: "packaging",
    label: "Packaging / Looks",
    min: 0,
    max: 5,
    group: "reveal",
    description: "How much you like the bottle presentation once the host unlocks it.",
    examples: "Examples: label design, bottle shape, shelf appeal, presentation",
  },
  {
    key: "value",
    label: "Value",
    min: 0,
    max: 5,
    group: "reveal",
    description: "How fair the bottle feels for the price after reveal-stage scoring opens.",
    examples: "Examples: worth the money, overpriced, daily buy, special occasion buy",
  },
] as const;

export type ScoreDraft = {
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
  notes: string;
  flavor_tags: string[];
};

export function makeEmptyDraft(): ScoreDraft {
  return {
    nose: 0,
    flavor: 0,
    mouthfeel: 0,
    complexity: 0,
    balance: 0,
    finish: 0,
    uniqueness: 0,
    drinkability: 0,
    packaging: 0,
    value: 0,
    notes: "",
    flavor_tags: [],
  };
}

export function computeTotal(d: ScoreDraft): number {
  return (
    d.nose +
    d.flavor +
    d.mouthfeel +
    d.complexity +
    d.balance +
    d.finish +
    d.uniqueness +
    d.drinkability +
    d.packaging +
    d.value
  );
}

export function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}
