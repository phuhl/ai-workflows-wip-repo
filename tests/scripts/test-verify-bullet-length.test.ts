import { describe, it, expect } from "vitest";
import { checkBullets } from "../../scripts/verify-bullet-length";

describe("checkBullets", () => {
  it("passes with short bullets", () => {
    const result = checkBullets(["short bullet", "another short one"]);
    expect(result.allPassed).toBe(true);
    expect(result.output).toContain("All 2 bullets");
    expect(result.output).toContain("within 200 char limit");
  });

  it("passes with exactly 200 chars", () => {
    const bullet = "x".repeat(200);
    const result = checkBullets([bullet]);
    expect(result.allPassed).toBe(true);
  });

  it("fails with 201 chars", () => {
    const bullet = "x".repeat(201);
    const result = checkBullets([bullet]);
    expect(result.allPassed).toBe(false);
    expect(result.output).toContain("FAIL:");
    expect(result.output).toContain("201 chars");
  });

  it("fails when one bullet is too long in a mix", () => {
    const result = checkBullets(["ok bullet", "x".repeat(201), "also ok"]);
    expect(result.allPassed).toBe(false);
    expect(result.output).toContain("Bullet 2");
  });

  it("handles unicode characters (counts bytes)", () => {
    const result = checkBullets([
      "This bullet has unicode chars: äöüñçé — it should count bytes",
    ]);
    expect(result.allPassed).toBe(true);
  });

  it("handles no bullets", () => {
    const result = checkBullets([]);
    expect(result.allPassed).toBe(true);
    expect(result.output).toContain("All 0 bullets");
  });
});
