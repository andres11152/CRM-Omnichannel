import { dealRepository } from "@/repositories/DealRepository";
import {
  DealPayload,
  WorkflowNode,
  WorkflowActionHandler,
} from "@/types/workflow.types";
import { Logger } from "@/utils/logger";

/**
 * CRM-context interpretation of the "assign_agent" node: a Deal has no
 * conversation to route, so reassigning it just means changing its owner
 * (assignedToId). The chatbot's AssignAgentNodeHandler (conversation
 * queue/status routing) is a different feature entirely — this does not
 * reuse it, since a deal has no conversationId to update.
 */
export class AssignDealOwnerActionHandler implements WorkflowActionHandler {
  async execute(
    node: WorkflowNode,
    payload: DealPayload,
    companyId: string,
  ): Promise<void> {
    const agentId = node.data?.agentId;
    if (!agentId) {
      Logger.warn(`[WorkflowAction:AssignDealOwner] node ${node.id} has no agentId configured`);
      return;
    }

    await dealRepository.update(payload.dealId, companyId, {
      assignedToId: agentId,
    });

    Logger.info(`[WorkflowAction:AssignDealOwner] Deal ${payload.dealId} reassigned to ${agentId}`);
  }
}
