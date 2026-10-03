import { describe, it, expect } from "vitest";
import { ReferenceNumber } from "@domain/reference-number";
import { ValidationError } from "@domain/errors";

describe("ReferenceNumber Value Object", () => {
  it("should create a valid reference number with padded sequence", () => {
    const ref = ReferenceNumber.create("IN", 2026, 42);
    expect(ref.toString()).toBe("IN-2026-000042");
    expect(ref.direction).toBe("IN");
    expect(ref.year).toBe(2026);
    expect(ref.sequence).toBe(42);
  });

  it("should throw ValidationError if sequence is <= 0 or > 999999", () => {
    expect(() => ReferenceNumber.create("IN", 2026, 0)).toThrow(ValidationError);
    expect(() => ReferenceNumber.create("OUT", 2026, 1000000)).toThrow(ValidationError);
  });

  it("should parse a valid formatted reference number string", () => {
    const ref = ReferenceNumber.parse("IN-2026-000412");
    expect(ref.direction).toBe("IN");
    expect(ref.year).toBe(2026);
    expect(ref.sequence).toBe(412);
    expect(ref.toString()).toBe("IN-2026-000412");
  });

  it("should parse regardless of whitespace or casing", () => {
    const ref = ReferenceNumber.parse("  out-2026-000088  ");
    expect(ref.direction).toBe("OUT");
    expect(ref.sequence).toBe(88);
    expect(ref.toString()).toBe("OUT-2026-000088");
  });

  it("should reject invalid reference formats", () => {
    expect(() => ReferenceNumber.parse("INVALID-FORMAT")).toThrow(ValidationError);
    expect(() => ReferenceNumber.parse("IN-26-0001")).toThrow(ValidationError);
    expect(() => ReferenceNumber.parse("IN-2026-ABCDEF")).toThrow(ValidationError);
  });
});
