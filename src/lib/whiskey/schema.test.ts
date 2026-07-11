import { describe, expect, it } from "vitest";
import {
  buildWhiskeyIdentityKey,
  mapWhiskeyRow,
  parseOptionalNumber,
  toNullableText,
} from "./schema";

describe("buildWhiskeyIdentityKey", () => {
  it("normalizes case and whitespace", () => {
    expect(
      buildWhiskeyIdentityKey({
        name: "  Eagle   Rare ",
        distillery: "Buffalo  Trace",
        proof: 90,
        bottleSize: "750 mL",
      })
    ).toBe("eagle rare|buffalo trace|90|750 ml");
  });

  it("returns empty string when the name is missing", () => {
    expect(buildWhiskeyIdentityKey({ name: "" })).toBe("");
    expect(buildWhiskeyIdentityKey({ name: "   " })).toBe("");
    expect(buildWhiskeyIdentityKey({ name: null })).toBe("");
  });

  it("leaves optional segments empty but keeps separators", () => {
    expect(buildWhiskeyIdentityKey({ name: "Weller" })).toBe("weller|||");
  });

  it("normalizes numeric proof representation", () => {
    expect(buildWhiskeyIdentityKey({ name: "x", proof: 90.0 })).toBe("x||90|");
    expect(buildWhiskeyIdentityKey({ name: "x", proof: 100.5 })).toBe(
      "x||100.5|"
    );
  });

  it("produces the same key for equivalent inputs", () => {
    const a = buildWhiskeyIdentityKey({
      name: "Blanton's",
      distillery: "Buffalo Trace",
      proof: 93,
      bottleSize: "750ml",
    });
    const b = buildWhiskeyIdentityKey({
      name: "blanton's  ",
      distillery: " buffalo trace",
      proof: 93.0,
      bottleSize: "750ML",
    });
    expect(a).toBe(b);
  });
});

describe("parseOptionalNumber", () => {
  it("parses plain and formatted numbers", () => {
    expect(parseOptionalNumber("90")).toBe(90);
    expect(parseOptionalNumber("$1,234.56")).toBe(1234.56);
    expect(parseOptionalNumber(" 107 ")).toBe(107);
  });

  it("returns null for empty or non-numeric input", () => {
    expect(parseOptionalNumber("")).toBeNull();
    expect(parseOptionalNumber("   ")).toBeNull();
    expect(parseOptionalNumber("abc")).toBeNull();
    expect(parseOptionalNumber(null)).toBeNull();
    expect(parseOptionalNumber(undefined)).toBeNull();
  });
});

describe("toNullableText", () => {
  it("collapses whitespace and returns null for blank input", () => {
    expect(toNullableText("  a   b ")).toBe("a b");
    expect(toNullableText("")).toBeNull();
    expect(toNullableText("   ")).toBeNull();
    expect(toNullableText(null)).toBeNull();
  });
});

describe("mapWhiskeyRow", () => {
  it("maps snake_case columns to the WhiskeyOption shape", () => {
    const option = mapWhiskeyRow({
      id: "abc",
      name: "Weller 12",
      distillery: "Buffalo Trace",
      proof: "90",
      age: "12",
      bottle_size: "750ml",
      category: "Bourbon",
      subcategory: null,
      rarity: "Allocated",
      msrp: "$39.99",
      secondary: 250,
      paid: null,
      status: "Open",
      notes: "  ",
      identity_key: "weller 12|buffalo trace|90|750ml",
    });

    expect(option).toEqual({
      id: "abc",
      name: "Weller 12",
      distillery: "Buffalo Trace",
      proof: 90,
      age: "12",
      bottleSize: "750ml",
      category: "Bourbon",
      subcategory: null,
      rarity: "Allocated",
      msrp: 39.99,
      secondary: 250,
      paid: null,
      status: "Open",
      notes: null,
      identityKey: "weller 12|buffalo trace|90|750ml",
    });
  });
});
