import { FlowSessionState, FlowNode } from "@/types/flow.types";
import { conversationRepository } from "@/repositories/ConversationRepository";
import { Logger } from "@/utils/logger";
import { Prisma } from "@prisma/client";

export class AssignAgentNodeHandler {
  async handle(
    node: FlowNode,
    session: FlowSessionState,
    conversationId: string,
    endSession: (sId: string) => Promise<void>
  ): Promise<string | null> {
    const { assignmentType, agentId, queueId, message } = node.data;

    type EnterpriseRoutingUpdate = Prisma.ConversationUpdateInput & {
      queueId?: string | null;
      assignedToId?: string | null;
      status?: string | Prisma.EnumConversationStatusFieldUpdateOperationsInput;
    };

    const updateData: EnterpriseRoutingUpdate = {};
    let logMsg = "";

    if (assignmentType === "queue" && queueId) {
      updateData.status = "OPEN";
      updateData.queueId = queueId;
      updateData.assignedToId = null;
      logMsg = `Routed to Queue ${queueId}`;
    } else if (agentId) {
      updateData.status = "IN_PROGRESS";
      updateData.assignedToId = agentId;
      logMsg = `Assigned to Agent ${agentId}`;
    } else {
      updateData.status = "OPEN";
      logMsg = "Moved to General Inbox (No routing target defined)";
    }

    await conversationRepository.update(
      session.companyId,
      conversationId,
      updateData as Prisma.ConversationUncheckedUpdateInput,
    );

    Logger.info(`[FlowExecutor] Handoff executed: ${logMsg}`);
    await endSession(session.id);

    return message || "We are connecting you with our team...";
  }
}
