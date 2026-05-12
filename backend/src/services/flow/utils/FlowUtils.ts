import { FlowVariables } from "@/types/flow.types";

export function replaceVariables(text: string, variables: FlowVariables): string {
  let result = text;
  for (const [key, value] of Object.entries(variables)) {
    const regex = new RegExp(`{{${key}}}`, "g");
    result = result.replace(regex, String(value));
  }
  return result;
}
