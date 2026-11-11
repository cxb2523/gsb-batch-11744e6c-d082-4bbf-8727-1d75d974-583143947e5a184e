import { describe, it, expect } from "vitest";
import { parseDuration } from "./format.ts";
import { formatDuration } from "./UIHelpers.ts";

describe("formatDuration", () => {
  it("formats mm:ss", () => {
    expect(formatDuration(212000)).toBe("3:32");
  });

  it("pads single-digit minutes and seconds", () => {
    expect(formatDuration(61000)).toBe("1:01");
    expect(formatDuration(60000)).toBe("1:00");
  });

  it("formats h:mm:ss", () => {
    expect(formatDuration(3661000)).toBe("1:01:01");
  });

  it("handles zero and invalid input", () => {
    expect(formatDuration(0)).toBe("0:00");
    expect(formatDuration(-5)).toBe("0:00");
    expect(formatDuration(Number.NaN)).toBe("0:00");
  });
});

describe("parseDuration", () => {
  it("parses m:ss", () => {
    expect(parseDuration("3:32")).toBe(212000);
  });

  it("parses h:mm:ss", () => {
    expect(parseDuration("1:01:01")).toBe(3661000);
  });

  it("parses plain second counts", () => {
    expect(parseDuration("90")).toBe(90000);
    expect(parseDuration("60")).toBe(60000);
  });

  it("accepts numeric milliseconds", () => {
    expect(parseDuration(212000)).toBe(212000);
    expect(parseDuration(-10)).toBe(0);
  });

  it("returns 0 on unparseable input", () => {
    expect(parseDuration("abc")).toBe(0);
    expect(parseDuration("1:x")).toBe(0);
    expect(parseDuration("")).toBe(0);
    expect(parseDuration("1:2:-3")).toBe(0);
  });
});
