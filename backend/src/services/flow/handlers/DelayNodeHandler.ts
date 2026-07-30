import { FlowSessionState, FlowStructure, FlowNode } from "@/types/flow.types";
import { flowSessionRepository } from "@/repositories/FlowSessionRepository";
import { flowQueueService } from "../../queue/flowQueueService";
import { parseDelayDurationMs } from "@/services/nodeActions/delayDuration";

export class DelayNodeHandler {
  async handle(
    node: FlowNode,
    session: FlowSessionState,
    flowStructure: FlowStructure,
    moveToNextNode: (sId: string, cId: string, fs: FlowStructure) => Promise<void>
  ): Promise<string | null> {
    const duration = parseDelayDurationMs(
      node.data.delayValue || node.data.content,
      node.data.delayUnit || "seconds",
    );

    await moveToNextNode(session.id, node.id, flowStructure);
    await flowSessionRepository.updateSession(session.id, { isPaused: true });
    await flowQueueService.scheduleResume(session.id, duration);

    return null;
  }
}
