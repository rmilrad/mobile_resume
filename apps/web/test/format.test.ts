import { describe, it, expect } from "vitest";
import { formatUsd, formatPriceCents, formatPct, formatSigned, shortName } from "../src/lib/format";

describe("format", () => {
  it("formatUsd", () => {
    expect(formatUsd(1234.5)).toBe("$1,234.50");
    expect(formatUsd(10, 0)).toBe("$10");
  });
  it("formatPriceCents", () => {
    expect(formatPriceCents(0.572)).toBe("57¢");
    expect(formatPriceCents(0.005)).toBe("1¢");
    expect(formatPriceCents(1)).toBe("100¢");
  });
  it("formatPct", () => {
    expect(formatPct(0.4)).toBe("40.0%");
  });
  it("formatSigned", () => {
    expect(formatSigned(12.3)).toBe("+12.30");
    expect(formatSigned(-12.3)).toBe("−12.30");
  });
  it("shortName truncates", () => {
    expect(shortName("a".repeat(30), 10)).toHaveLength(10);
    expect(shortName("short")).toBe("short");
  });
});
