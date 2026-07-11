import { describe, expect, it } from "vitest";
import { getCsvValue, normalizeHeader, parseCsv } from "./csv";

describe("parseCsv", () => {
  it("splits simple rows and fields", () => {
    expect(parseCsv("a,b,c\nd,e,f")).toEqual([
      ["a", "b", "c"],
      ["d", "e", "f"],
    ]);
  });

  it("handles CRLF line endings", () => {
    expect(parseCsv("a,b\r\nc,d\r\n")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  it("strips a leading UTF-8 BOM", () => {
    expect(parseCsv("\uFEFFname,proof\nEagle Rare,90")).toEqual([
      ["name", "proof"],
      ["Eagle Rare", "90"],
    ]);
  });

  it("keeps commas inside quoted fields", () => {
    expect(parseCsv('"Booker\'s, Batch 1",125.5')).toEqual([
      ["Booker's, Batch 1", "125.5"],
    ]);
  });

  it("unescapes doubled quotes inside quoted fields", () => {
    expect(parseCsv('"He said ""hi""",x')).toEqual([['He said "hi"', "x"]]);
  });

  it("keeps newlines inside quoted fields", () => {
    expect(parseCsv('"line1\nline2",x')).toEqual([["line1\nline2", "x"]]);
  });

  it("does not emit a trailing all-empty row", () => {
    expect(parseCsv("a,b\n")).toEqual([["a", "b"]]);
    expect(parseCsv("a,b\n,")).toEqual([["a", "b"]]);
  });

  it("keeps empty fields within a row", () => {
    expect(parseCsv("a,,c")).toEqual([["a", "", "c"]]);
  });
});

describe("normalizeHeader", () => {
  it("lowercases, trims, and collapses whitespace", () => {
    expect(normalizeHeader("  Bottle   Size ")).toBe("bottle size");
  });
});

describe("getCsvValue", () => {
  const headers = new Map([
    ["name", 0],
    ["proof", 1],
    ["missing", 5],
  ]);

  it("returns the trimmed value for a mapped header", () => {
    expect(getCsvValue([" Weller ", "107"], headers, "name")).toBe("Weller");
  });

  it("returns empty string for unknown or out-of-range headers", () => {
    expect(getCsvValue(["a", "b"], headers, "nope")).toBe("");
    expect(getCsvValue(["a", "b"], headers, "missing")).toBe("");
  });
});
