import { FlowSessionState, FlowStructure, FlowNode, FlowVariables } from "@/types/flow.types";
import { flowSessionRepository } from "@/repositories/FlowSessionRepository";
import { replaceVariables } from "../utils/FlowUtils";

export class AskDataNodeHandler {
  async handle(
    node: FlowNode,
    session: FlowSessionState,
    userMessage: string,
    flowStructure: FlowStructure,
    shouldConsumeInput: boolean,
    moveToNextNode: (sId: string, cId: string, fs: FlowStructure, v?: FlowVariables) => Promise<void>
  ): Promise<string | null> {
    const variableName = node.data.variable || "response";
    const question = node.data.question;

    if (!shouldConsumeInput) {
      await flowSessionRepository.updateSession(session.id, {
        currentNodeId: node.id,
        isPaused: true,
      });

      if (question && question.trim() !== "") {
        return replaceVariables(question, session.variables);
      }
      return null;
    }

    const updatedVariables = {
      ...session.variables,
      [variableName]: userMessage,
    };

    await flowSessionRepository.updateSession(session.id, {
      variables: updatedVariables,
      isPaused: false,
    });

    await moveToNextNode(session.id, node.id, flowStructure, updatedVariables);

    const confirmation = node.data.confirmation;
    if (confirmation) {
      return replaceVariables(confirmation, updatedVariables);
    }

    return null;
  }
}
