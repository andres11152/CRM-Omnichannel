import { FlowSessionState, FlowNode } from "@/types/flow.types";
import { conversationRepository } from "@/repositories/ConversationRepository";

export class HandoffNodeHandler {
  async handle(
    node: FlowNode,
    session: FlowSessionState,
    conversationId: string,
    endSession: (sId: string) => Promise<void>
  ): Promise<string> {
    await conversationRepository.update(session.companyId, conversationId, {
      status: "IN_PROGRESS",
    });

    await endSession(session.id);
    return node.data.message || "An agent will take your case shortly.";
  }
}
