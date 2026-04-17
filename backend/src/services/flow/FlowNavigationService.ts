import { Prisma } from "@prisma/client";
import { flowSessionRepository } from "@/repositories/FlowSessionRepository";
import { Logger } from "@/utils/logger";
import { cacheService } from "../CacheService";
import {
  FlowSessionState,
  FlowVariables,
  FlowNode,
  FlowStructure,
  FlowEdge,
  FlowSessionUpdate,
} from "@/types/flow.types";

/**
 * ️ FLOW NAVIGATION SERVICE
 *
 * Responsibilities:
 * - Session Start/End lifecycle
 * - Node state transitions (moveToNext, moveToSpecific)
 * - Topological Root resolution (START nodes)
 */
export class FlowNavigationService {
  // ────────────────────────────────────────────────
  // SESSION LIFECYCLE
  // ────────────────────────────────────────────────

  async startNewSession(
    flowId: string,
    contactId: string,
    companyId: string,
    conversationId: string,
  ): Promise<FlowSessionState> {
    const flow = await this.getFlowCached(flowId);
    if (!flow) throw new Error(`Flow not found: ${flowId}`);

    const flowStructure: FlowStructure = {
      nodes: (flow.nodes as unknown as FlowNode[]) || [],
      edges: (flow.edges as unknown as FlowEdge[]) || [],
    };

    let startNode = flowStructure.nodes.find(
      (n) => n.type === "START" || (n.type as string).toUpperCase() === "TRIGGER",
    );

    // Fallback: Topological root (no incoming edges)
    if (!startNode && flowStructure.nodes.length > 0) {
      const validNodeIds = new Set(flowStructure.nodes.map((n) => n.id));
      const internalEdges = flowStructure.edges.filter((e) =>
        validNodeIds.has(e.source),
      );
      const targetNodeIds = new Set(internalEdges.map((e) => e.target));
      const rootNodes = flowStructure.nodes.filter(
        (n) => !targetNodeIds.has(n.id),
      );

      if (rootNodes.length > 0) {
        startNode = rootNodes[0];
        Logger.info(`[FlowNav] Resolved implicit start node: ${startNode.id}`);
      }
    }

    if (!startNode) {
      throw new Error(`Execution error: No START node found in flow ${flowId}`);
    }

    // Clean up old active sessions for this contact/flow
    await flowSessionRepository.deleteActiveSessions(contactId, flow.id);

    try {
      const newSession = await flowSessionRepository.createSession({
        contactId,
        flowId: flow.id,
        companyId,
        conversationId,
        currentNodeId: startNode.id,
        isActive: true,
        variables: {},
        visitedNodes: [startNode.id],
      });

      Logger.info(`[FlowNav]  Started session ${newSession.id} for contact ${contactId}`);

      return {
        ...newSession,
        variables: (newSession.variables as FlowVariables) || {},
      } as FlowSessionState;
    } catch (err: unknown) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2003"
      ) {
        Logger.error(`[FlowNav] [ERROR] FK Violation for Flow ${flow.id}. Invalidating cache.`);
        await cacheService.delete(`workflow:${flow.id}`);
      }
      throw err;
    }
  }

  async endSession(sessionId: string): Promise<void> {
    await flowSessionRepository.deleteSession(sessionId);
    Logger.info(`[FlowNav] [COMPLETE] Session ended: ${sessionId}`);
  }

  // ────────────────────────────────────────────────
  // NAVIGATION HELPERS
  // ────────────────────────────────────────────────

  async moveToNextNode(
    sessionId: string,
    currentNodeId: string,
    flowStructure: FlowStructure,
    variables?: FlowVariables,
  ): Promise<void> {
    const edge = flowStructure.edges.find((e) => e.source === currentNodeId);

    if (!edge) {
      await this.endSession(sessionId);
      return;
    }

    const updateData: FlowSessionUpdate = {
      currentNodeId: edge.target,
      lastStepAt: new Date(),
    };

    if (variables) updateData.variables = variables;

    await flowSessionRepository.updateSession(sessionId, updateData);
  }

  async moveToSpecificNode(
    sessionId: string,
    targetNodeId: string,
  ): Promise<void> {
    await flowSessionRepository.updateSession(sessionId, {
      currentNodeId: targetNodeId,
      lastStepAt: new Date(),
    });
  }

  // ────────────────────────────────────────────────
  // CACHING
  // ────────────────────────────────────────────────

  async getFlowCached(flowId: string) {
    return await cacheService.wrap(
      `workflow:${flowId}`,
      async () => {
        return flowSessionRepository.findWorkflow(flowId);
      },
      3600,
    );
  }
}
