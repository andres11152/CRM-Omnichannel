/**
 * Shared duration parser for the "Delay" node — same node.data shape
 * (`delayValue`/`delayUnit`) the FlowBuilder canvas writes for both the
 * chatbot (DelayNodeHandler) and CRM workflow (DelayActionHandler) engines.
 */
export function parseDelayDurationMs(
  delayValue: string | number | undefined,
  delayUnit: string | undefined,
): number {
  const value = parseInt(String(delayValue ?? "5"), 10) || 5;
  switch (delayUnit) {
    case "minutes":
      return value * 60 * 1000;
    case "hours":
      return value * 60 * 60 * 1000;
    case "days":
      return value * 24 * 60 * 60 * 1000;
    case "seconds":
    default:
      return value * 1000;
  }
}
