import { evaluateOperator } from "../src/utils/conditionEvaluator";

describe("evaluateOperator", () => {
  it("equals is case-insensitive", () => {
    expect(evaluateOperator("equals", "Ganado", "ganado")).toBe(true);
    expect(evaluateOperator("equals", "Ganado", "perdido")).toBe(false);
  });

  it("contains", () => {
    expect(evaluateOperator("contains", "Negociación Final", "negoci")).toBe(true);
    expect(evaluateOperator("contains", "Negociación Final", "cierre")).toBe(false);
  });

  it("starts_with / ends_with", () => {
    expect(evaluateOperator("starts_with", "Nuevo Lead", "nuevo")).toBe(true);
    expect(evaluateOperator("ends_with", "Nuevo Lead", "lead")).toBe(true);
    expect(evaluateOperator("starts_with", "Nuevo Lead", "lead")).toBe(false);
  });

  it("regex", () => {
    expect(evaluateOperator("regex", "deal-12345", "^deal-\\d+$")).toBe(true);
    expect(evaluateOperator("regex", "deal-abc", "^deal-\\d+$")).toBe(false);
  });

  it("regex with invalid pattern fails closed", () => {
    expect(evaluateOperator("regex", "anything", "(unterminated")).toBe(false);
  });

  it("is_empty / exists", () => {
    expect(evaluateOperator("is_empty", "   ", "")).toBe(true);
    expect(evaluateOperator("is_empty", "value", "")).toBe(false);
    expect(evaluateOperator("exists", "value", "")).toBe(true);
    expect(evaluateOperator("exists", "  ", "")).toBe(false);
  });

  it("greater_than / less_than are numeric", () => {
    expect(evaluateOperator("greater_than", "15000", "10000")).toBe(true);
    expect(evaluateOperator("greater_than", "5000", "10000")).toBe(false);
    expect(evaluateOperator("less_than", "5000", "10000")).toBe(true);
  });

  it("greater_than / less_than are false when either side is not numeric", () => {
    expect(evaluateOperator("greater_than", "not-a-number", "10000")).toBe(false);
    expect(evaluateOperator("less_than", "10000", "not-a-number")).toBe(false);
  });

  it("unknown operator falls back to contains", () => {
    expect(evaluateOperator("bogus_operator", "hello world", "world")).toBe(true);
  });
});
