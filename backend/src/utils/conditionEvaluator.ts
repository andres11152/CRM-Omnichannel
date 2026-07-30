export type ConditionOperator =
  | "equals"
  | "contains"
  | "starts_with"
  | "ends_with"
  | "regex"
  | "is_empty"
  | "exists"
  | "greater_than"
  | "less_than";

/**
 * Single source of truth for condition-node comparisons, shared by the
 * chatbot flow engine (ConditionNodeHandler) and the CRM workflow engine
 * (ConditionActionHandler) so the two never silently diverge on what
 * "greater_than" or "contains" means.
 */
export function evaluateOperator(
  operator: string,
  actual: string,
  expected: string,
): boolean {
  const a = actual.toLowerCase();
  const e = expected.toLowerCase();
  const numA = parseFloat(actual);
  const numE = parseFloat(expected);

  switch (operator as ConditionOperator) {
    case "equals":
      return a === e;
    case "contains":
      return a.includes(e);
    case "starts_with":
      return a.startsWith(e);
    case "ends_with":
      return a.endsWith(e);
    case "regex":
      try {
        return new RegExp(expected, "i").test(actual);
      } catch {
        return false;
      }
    case "is_empty":
      return actual.trim().length === 0;
    case "exists":
      return actual.trim().length > 0;
    case "greater_than":
      return !isNaN(numA) && !isNaN(numE) && numA > numE;
    case "less_than":
      return !isNaN(numA) && !isNaN(numE) && numA < numE;
    default:
      return a.includes(e);
  }
}
