import { describe, it, expect } from "vitest";
import { normalizePhone } from "../src/services/phone.js";

describe("Phone Normalization", () => {
  it("should accept valid 10-digit numbers", () => {
    expect(normalizePhone("9841234567")).toEqual({
      valid: true,
      normalized: "9841234567",
    });
  });

  it("should strip +977 prefix", () => {
    expect(normalizePhone("+9779801122334")).toEqual({
      valid: true,
      normalized: "9801122334",
    });
  });

  it("should strip 977 prefix", () => {
    expect(normalizePhone("9779761234567")).toEqual({
      valid: true,
      normalized: "9761234567",
    });
  });

  it("should reject numbers not starting with 97 or 98", () => {
    expect(normalizePhone("9612345678").valid).toBe(false);
  });

  it("should reject 9-digit numbers", () => {
    expect(normalizePhone("984123456").valid).toBe(false);
  });
});
