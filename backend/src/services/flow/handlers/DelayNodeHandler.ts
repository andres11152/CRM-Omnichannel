import { FlowSessionState, FlowStructure, FlowNode } from "@/types/flow.types";
import { flowSessionRepository } from "@/repositories/FlowSessionRepository";
import { flowQueueService } from "../../queue/flowQueueService";

export class DelayNodeHandler {
  async handle(
    node: FlowNode,
    session: FlowSessionState,
    flowStructure: FlowStructure,
    moveToNextNode: (sId: string, cId: string, fs: FlowStructure) => Promise<void>
  ): Promise<string | null> {
    const delayValue = parseInt(node.data.delayValue || node.data.content || "5");
    const delayUnit = node.data.delayUnit || "seconds";

    let duration = delayValue * 1000; // default to seconds
    if (delayUnit === "minutes") {
      duration = delayValue * 60 * 1000;
    } else if (delayUnit === "hours") {
      duration = delayValue * 60 * 60 * 1000;
    } else if (delayUnit === "days") {
      duration = delayValue * 24 * 60 * 60 * 1000;
    }

    await moveToNextNode(session.id, node.id, flowStructure);
    await flowSessionRepository.updateSession(session.id, { isPaused: true });
    await flowQueueService.scheduleResume(session.id, duration);

    return null;
  }
}
