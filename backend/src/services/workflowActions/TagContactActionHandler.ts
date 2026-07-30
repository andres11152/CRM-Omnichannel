import { dealRepository } from "@/repositories/DealRepository";
import { applyContactTags } from "@/services/nodeActions/tagContactAction";
import {
  DealPayload,
  WorkflowNode,
  WorkflowActionHandler,
} from "@/types/workflow.types";
import { Logger } from "@/utils/logger";

export class TagContactActionHandler implements WorkflowActionHandler {
  async execute(
    node: WorkflowNode,
    payload: DealPayload,
    companyId: string,
  ): Promise<void> {
    const tags = node.data?.tags || node.data?.tag || "";
    const action = (node.data?.action || "add") as "add" | "remove";
    if (!tags) return;

    const deal = await dealRepository.findById(payload.dealId, companyId);
    const contactId = deal?.contact?.id;
    if (!contactId) {
      Logger.warn(`[WorkflowAction:TagContact] Deal ${payload.dealId} has no linked contact`);
      return;
    }

    await applyContactTags(companyId, contactId, tags, action);
  }
}
