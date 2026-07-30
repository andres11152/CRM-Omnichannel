import { dealRepository } from "@/repositories/DealRepository";
import { dealStageHistoryRepository } from "@/repositories/DealStageHistoryRepository";
import { evaluateOperator } from "@/utils/conditionEvaluator";
import {
  DealPayload,
  WorkflowNode,
  WorkflowActionHandler,
  WorkflowActionResult,
} from "@/types/workflow.types";
import { Logger } from "@/utils/logger";

/**
 * Resolves the field a CRM workflow condition checks against. Mirrors the
 * chatbot's `session.variables[variable]` lookup, but a Deal has no
 * "variables" bag of its own scalar fields, so well-known `deal.*` paths
 * are read from the deal record and everything else falls back to the
 * payload's ad-hoc `variables` (e.g. `last_ai_response` from an AI_AGENT
 * node earlier in the same graph).
 */
async function resolveFieldValue(
  fieldPath: string,
  payload: DealPayload,
  companyId: string,
): Promise<string> {
  if (fieldPath.startsWith("deal.")) {
    const deal = await dealRepository.findById(payload.dealId, companyId);
    if (!deal) return "";
    const field = fieldPath.slice("deal.".length);
    switch (field) {
      case "value":
        return String(deal.value ?? "");
      case "probability":
        return String(deal.probability ?? "");
      case "stage":
        return deal.stage?.name ?? "";
      case "assignedToId":
        return deal.assignedToId ?? "";
      case "tags":
        // Deals have no tags of their own — this is the linked contact's.
        return Array.isArray(deal.contact?.tags) ? deal.contact.tags.join(",") : "";
      case "daysInStage": {
        const entry = await dealStageHistoryRepository.findLatestStageEntry(
          companyId,
          payload.dealId,
          deal.stageId,
        );
        // Deals that entered their current stage before the history log
        // started recording have no entry — fall back to updatedAt as the
        // best available approximation.
        const since = entry?.changedAt ?? deal.updatedAt;
        const days = (Date.now() - new Date(since).getTime()) / 86_400_000;
        return String(Math.floor(days));
      }
      default:
        return "";
    }
  }

  if (fieldPath === "newStage") return payload.newStage ?? "";
  if (fieldPath === "previousStage") return payload.previousStage ?? "";

  return String(payload.variables?.[fieldPath] ?? "");
}

export class ConditionActionHandler implements WorkflowActionHandler {
  async execute(
    node: WorkflowNode,
    payload: DealPayload,
    companyId: string,
  ): Promise<WorkflowActionResult | void> {
    const conditions = node.data?.conditions || [];
    const variable = node.data?.conditionVariable || "newStage";
    const valueToCheck = await resolveFieldValue(variable, payload, companyId);

    if (conditions.length > 0) {
      for (const condition of conditions) {
        if (evaluateOperator(condition.operator, valueToCheck, condition.value)) {
          Logger.info(
            `[WorkflowCondition] ${variable}="${valueToCheck}" ${condition.operator} "${condition.value}" -> ${condition.targetHandle}`,
          );
          return { branch: condition.targetHandle };
        }
      }
      // No rule matched: follow the unlabeled/default edge, if any.
      return { branch: "" };
    }

    // Legacy single-condition shape (TRUE/FALSE), same as the chatbot node.
    const operator = node.data?.conditionOperator || "contains";
    const conditionValue = node.data?.conditionValue || "";
    const matched = evaluateOperator(operator, valueToCheck, conditionValue);
    return { branch: matched ? "TRUE" : "FALSE" };
  }
}
