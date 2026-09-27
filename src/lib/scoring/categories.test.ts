import { describe, expect, it } from "vitest";
import {
  CATEGORY_SPEC,
  clamp,
  computeTotal,
  makeEmptyDraft,
  type ScoreDraft,
} from "./categories";

describe("CATEGORY_SPEC", () => {
  it("defines a 100-point model", () => {
    const maxTotal = CATEGORY_SPEC.reduce((sum, spec) => sum + spec.max, 0);
    expect(maxTotal).toBe(100);
  });

  it("allows 0 in every category", () => {
    for (const spec of CATEGORY_SPEC) {
      expect(spec.min).toBe(0);
    }
  });

  it("has eight core and two reveal categories", () => {
    const core = CATEGORY_SPEC.filter((spec) => spec.group === "core");
    const reveal = CATEGORY_SPEC.filter((spec) => spec.group === "reveal");
    expect(core).toHaveLength(8);
    expect(reveal).toHaveLength(2);
    expect(reveal.map((spec) => spec.key)).toEqual(["packaging", "value"]);
  });

  it("matches the numeric fields of ScoreDraft", () => {
    const draft = makeEmptyDraft();
    for (const spec of CATEGORY_SPEC) {
      expect(typeof draft[spec.key]).toBe("number");
    }
  });
});

describe("computeTotal", () => {
  it("returns 0 for an empty draft", () => {
    expect(computeTotal(makeEmptyDraft())).toBe(0);
  });

  it("sums every category and ignores notes and tags", () => {
    const draft: ScoreDraft = {
      nose: 8,
      flavor: 17,
      mouthfeel: 7,
      complexity: 9,
      balance: 6,
      finish: 8,
      uniqueness: 5,
      drinkability: 9,
      packaging: 4,
      value: 3,
      notes: "irrelevant",
      flavor_tags: ["oak"],
    };
    expect(computeTotal(draft)).toBe(76);
  });

  it("returns 100 when every category is at its max", () => {
    const draft = makeEmptyDraft();
    for (const spec of CATEGORY_SPEC) {
      draft[spec.key] = spec.max;
    }
    expect(computeTotal(draft)).toBe(100);
  });
});

describe("clamp", () => {
  it("keeps in-range values unchanged", () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(0, 0, 10)).toBe(0);
    expect(clamp(10, 0, 10)).toBe(10);
  });

  it("clamps out-of-range values to the bounds", () => {
    expect(clamp(-3, 0, 10)).toBe(0);
    expect(clamp(42, 0, 20)).toBe(20);
  });
});
