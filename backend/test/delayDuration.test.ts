import { parseDelayDurationMs } from "../src/services/nodeActions/delayDuration";

describe("parseDelayDurationMs", () => {
  it("defaults to 5 seconds when value/unit are missing", () => {
    expect(parseDelayDurationMs(undefined, undefined)).toBe(5000);
  });

  it("converts seconds/minutes/hours/days correctly", () => {
    expect(parseDelayDurationMs("10", "seconds")).toBe(10_000);
    expect(parseDelayDurationMs("3", "minutes")).toBe(3 * 60 * 1000);
    expect(parseDelayDurationMs("2", "hours")).toBe(2 * 60 * 60 * 1000);
    expect(parseDelayDurationMs("1", "days")).toBe(24 * 60 * 60 * 1000);
  });

  it("falls back to 5 when the value is not a valid number", () => {
    expect(parseDelayDurationMs("not-a-number", "seconds")).toBe(5000);
  });

  it("accepts numeric values directly, not just strings", () => {
    expect(parseDelayDurationMs(7, "minutes")).toBe(7 * 60 * 1000);
  });
});
