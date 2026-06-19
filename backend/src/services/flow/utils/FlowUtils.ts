import { FlowVariables } from "@/types/flow.types";

export function replaceVariables(text: string, variables: FlowVariables): string {
  let result = text;
  for (const [key, value] of Object.entries(variables)) {
    const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`{{${escapedKey}}}`, "g");
    result = result.replace(regex, String(value));
  }
  return result;
}
