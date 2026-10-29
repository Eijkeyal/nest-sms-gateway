import { describe, it, expect } from "vitest";
import { calculateSegments } from "../src/services/segmenter.js";

describe("SMS Segmentation", () => {
  it("should return 1 part for GSM7 under 160 chars", () => {
    expect(calculateSegments("Hello world")).toEqual({
      encoding: "GSM7",
      parts: 1,
    });
  });

  it("should return 2 parts for GSM7 over 160 chars", () => {
    const msg = "a".repeat(161);
    expect(calculateSegments(msg)).toEqual({ encoding: "GSM7", parts: 2 });
  });

  it("should flip entire message to UCS2 if it contains an emoji", () => {
    const msg = "Hello world 🎉"; // The emoji forces UCS2
    expect(calculateSegments(msg).encoding).toBe("UCS2");
  });

  it("should flip entire message to UCS2 if it contains Nepali (Devanagari)", () => {
    const msg = "नमस्ते";
    expect(calculateSegments(msg).encoding).toBe("UCS2");
  });

  it("should return 2 parts for UCS2 over 70 chars", () => {
    const msg = "न".repeat(71); // 71 Devanagari characters
    expect(calculateSegments(msg)).toEqual({ encoding: "UCS2", parts: 2 });
  });
  it("should count GSM-7 extension characters as 2 septets", () => {
    // 159 normal chars + 1 extension char (^) = 159 + 2 = 161 septets
    // 161 > 160 → should be 2 parts (not 1!)
    const msg = "a".repeat(159) + "^";
    expect(calculateSegments(msg)).toEqual({ encoding: "GSM7", parts: 2 });
  });
});
