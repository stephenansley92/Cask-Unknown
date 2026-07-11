import { describe, expect, it } from "vitest";
import { safeInternalPath } from "./redirects";

describe("safeInternalPath", () => {
  it("accepts normal internal paths", () => {
    expect(safeInternalPath("/")).toBe("/");
    expect(safeInternalPath("/profile")).toBe("/profile");
    expect(safeInternalPath("/host/abc?key=xyz")).toBe("/host/abc?key=xyz");
    expect(safeInternalPath("/history/rate/1?returnTo=%2Fprofile")).toBe(
      "/history/rate/1?returnTo=%2Fprofile"
    );
    expect(safeInternalPath("  /join/123  ")).toBe("/join/123");
  });

  it("rejects protocol-relative URLs", () => {
    expect(safeInternalPath("//evil.com", "/fallback")).toBe("/fallback");
    expect(safeInternalPath("//evil.com/path")).toBe("");
    expect(safeInternalPath("/%2F%2Fevil.com")).toBe("");
  });

  it("rejects absolute and scheme-bearing URLs", () => {
    expect(safeInternalPath("https://evil.com")).toBe("");
    expect(safeInternalPath("javascript:alert(1)")).toBe("");
    expect(safeInternalPath("mailto:a@b.c")).toBe("");
  });

  it("rejects backslash variants", () => {
    expect(safeInternalPath("/\\evil.com")).toBe("");
    expect(safeInternalPath("\\\\evil.com")).toBe("");
    expect(safeInternalPath("/%5C%5Cevil.com")).toBe("");
  });

  it("rejects control characters, raw or encoded", () => {
    expect(safeInternalPath("/path\r\nSet-Cookie: x")).toBe("");
    expect(safeInternalPath("/path%0d%0aSet-Cookie:%20x")).toBe("");
    expect(safeInternalPath("/path%00")).toBe("");
    expect(safeInternalPath("/path\tx")).toBe("");
  });

  it("rejects malformed percent-encoding", () => {
    expect(safeInternalPath("/path%zz")).toBe("");
    expect(safeInternalPath("/path%")).toBe("");
  });

  it("rejects non-string and empty input", () => {
    expect(safeInternalPath(undefined, "/fallback")).toBe("/fallback");
    expect(safeInternalPath(null)).toBe("");
    expect(safeInternalPath(42)).toBe("");
    expect(safeInternalPath("")).toBe("");
    expect(safeInternalPath("   ")).toBe("");
    expect(safeInternalPath("profile")).toBe("");
  });

  it("returns the fallback untouched", () => {
    expect(safeInternalPath("//evil.com", "/profile")).toBe("/profile");
    expect(safeInternalPath("x", "/login")).toBe("/login");
  });
});
