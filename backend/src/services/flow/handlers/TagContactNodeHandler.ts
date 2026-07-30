import { FlowSessionState, FlowStructure, FlowNode } from "@/types/flow.types";
import { Logger } from "@/utils/logger";
import { applyContactTags } from "@/services/nodeActions/tagContactAction";

export class TagContactNodeHandler {
  async handle(
    node: FlowNode,
    session: FlowSessionState,
    flowStructure: FlowStructure,
    moveToNextNode: (sId: string, cId: string, fs: FlowStructure) => Promise<void>
  ): Promise<string | null> {
    const tags = (node.data.tags || node.data.tag || "") as string;
    const action = (((node.data as Record<string, unknown>).action as string) || "add") as "add" | "remove";

    if (tags && session.contactId) {
      try {
        await applyContactTags(session.companyId, session.contactId, tags, action);
      } catch (error) {
        Logger.error(`[FlowExec] TAG_CONTACT failed:`, error);
      }
    }

    await moveToNextNode(session.id, node.id, flowStructure);
    return null;
  }
}
