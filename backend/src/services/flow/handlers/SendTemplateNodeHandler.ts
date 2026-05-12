import { FlowSessionState, FlowStructure, FlowNode, FlowVariables } from "@/types/flow.types";
import { flowSessionRepository } from "@/repositories/FlowSessionRepository";
import { Logger } from "@/utils/logger";
import { replaceVariables } from "../utils/FlowUtils";

export class SendTemplateNodeHandler {
  async handle(
    node: FlowNode,
    session: FlowSessionState,
    flowStructure: FlowStructure,
    moveToNextNode: (sId: string, cId: string, fs: FlowStructure) => Promise<void>
  ): Promise<string | null> {
    const templateName = node.data.templateName || "";
    const templateParams = node.data.templateParams as string[] | undefined;

    if (!templateName) {
      Logger.warn(`[FlowExec] SEND_TEMPLATE node ${node.id} has no template configured`);
      await moveToNextNode(session.id, node.id, flowStructure);
      return null;
    }

    const resolvedParams = (templateParams || []).map((p: string) =>
      replaceVariables(p, session.variables)
    );

    const updatedVars: FlowVariables = {
      ...session.variables,
      _pending_template: templateName,
      _pending_template_params: JSON.stringify(resolvedParams),
    };

    await flowSessionRepository.updateSession(session.id, { variables: updatedVars });
    await moveToNextNode(session.id, node.id, flowStructure);

    Logger.info(`[FlowExec] SEND_TEMPLATE: Queued template "${templateName}" with ${resolvedParams.length} params`);
    return null;
  }
}
