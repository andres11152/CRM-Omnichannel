/**
 * Flow Executor Service (Refactored Orchestrator)
 *
 * Motor de ejecución de chatbot flows. Intercepta mensajes entrantes
 * y ejecuta la lógica definida en el diagrama visual (React Flow).
 *
 * Phase 2 Refactor: All node-type handlers extracted to FlowNodeHandlers.
 * This file retains: session lifecycle, execution loop, trigger matching, and node dispatch.
 *
 * 🔒 FULLY TYPED: No `any` types used in this file.
 */

import { Prisma } from "@prisma/client";
import { flowSessionRepository } from "@/repositories/FlowSessionRepository";
import { Logger } from "@/utils/logger";
import { getErrorMessage } from "@/utils/errorHelpers";
import type {
  FlowSessionState,
  FlowVariables,
  FlowNode,
  FlowStructure,
  FlowExecutionResult,
  FlowSessionUpdate,
  KeywordTriggerData,
  FlowEdge,
} from "@/types/flow.types";
import { cacheService } from "./cacheService";
import { FlowNodeHandlers } from "./flow/FlowNodeHandlers";

// 🛡️ TIMEOUT CONFIGURATION
const NODE_TIMEOUT_MS = 30000;
const AI_TIMEOUT_MS = 45000;

// 🔧 HELPER: Parse Prisma JSON to FlowSessionState
const toFlowSessionState = (
  prismaSession: {
    id: string;
    contactId: string;
    flowId: string;
    companyId: string;
    conversationId: string | null;
    currentNodeId: string | null;
    isActive: boolean;
    isPaused: boolean;
    variables: unknown;
    visitedNodes: string[];
    startedAt?: Date;
    lastStepAt?: Date;
    completedAt?: Date | null;
  } | null,
): FlowSessionState | null => {
  if (!prismaSession) return null;

  return {
    ...prismaSession,
    conversationId: prismaSession.conversationId || "",
    variables: (prismaSession.variables as FlowVariables) || {},
  };
};

export class FlowExecutorService {
  private nodeHandlers: FlowNodeHandlers;

  constructor() {
    this.nodeHandlers = new FlowNodeHandlers();
  }

  // ────────────────────────────────────────────────
  // PUBLIC API
  // ────────────────────────────────────────────────

  async resumeSession(sessionId: string): Promise<FlowExecutionResult[]> {
    const sessionPrisma = await flowSessionRepository.findSession(sessionId);

    if (!sessionPrisma || !sessionPrisma.isActive) return [];

    await flowSessionRepository.updateSession(sessionId, { isPaused: false });

    const session = toFlowSessionState(sessionPrisma);
    if (!session) return [];

    return await this.runFlowLoop(
      session,
      "",
      session.companyId,
      session.conversationId,
      false,
    );
  }

  async processMessage(
    contactId: string,
    message: string,
    conversationId: string,
    companyId: string,
  ): Promise<FlowExecutionResult[]> {
    const results: FlowExecutionResult[] = [];

    try {
      let session = await this.getActiveSession(contactId);

      const triggerSession = await this.checkTriggers(
        contactId,
        message,
        companyId,
        conversationId,
        session?.flowId,
      );

      if (triggerSession) {
        if (session) {
          Logger.info(
            `[FlowExecutor] 🔄 Interrupting session ${session.id} due to global trigger match.`,
          );
          await this.endSession(session.id);
        }
        session = triggerSession;
      } else if (!session) {
        return [];
      }

      let isInputResumption = false;

      if (session && session.isPaused) {
        await flowSessionRepository.updateSession(session.id, {
          isPaused: false,
        });
        session.isPaused = false;
        isInputResumption = true;
      }

      return await this.runFlowLoop(
        session,
        message,
        companyId,
        conversationId,
        isInputResumption,
      );
    } catch (error: unknown) {
      const errorMsg = getErrorMessage(error);
      Logger.error("[FlowExecutor] Error processing message:", errorMsg);
      if (results.length === 0)
        return ["Hubo un error técnico procesando tu solicitud."];
      return results;
    }
  }

  async getSessionById(sessionId: string): Promise<FlowSessionState | null> {
    const session = await flowSessionRepository.findSessionWithFlow(sessionId);

    if (session && session.flow) {
      return toFlowSessionState(session);
    }
    return null;
  }

  // ────────────────────────────────────────────────
  // CORE EXECUTION LOOP
  // ────────────────────────────────────────────────

  private async runFlowLoop(
    initialSession: FlowSessionState,
    message: string,
    companyId: string,
    conversationId: string,
    isInputResumption: boolean = false,
  ): Promise<FlowExecutionResult[]> {
    const results: FlowExecutionResult[] = [];
    const MAX_LOOPS = 20;
    let loopCount = 0;
    let session = initialSession;
    let isFirstNode = true;

    while (
      session &&
      session.isActive &&
      !session.isPaused &&
      loopCount < MAX_LOOPS
    ) {
      loopCount++;

      const flow = await this.getFlowCached(session.flowId);

      if (!flow || !flow.isActive) {
        Logger.warn(
          `[FlowExecutor] Flow ${session.flowId} not found or inactive`,
        );
        await this.endSession(session.id);
        break;
      }

      const flowStructure: FlowStructure = {
        nodes: (flow.nodes as unknown as FlowNode[]) || [],
        edges: (flow.edges as unknown as FlowEdge[]) || [],
      };

      const currentNode = flowStructure.nodes.find(
        (n) => n.id === session.currentNodeId,
      );

      if (!currentNode) {
        Logger.error(
          `[FlowExecutor] Current node ${session.currentNodeId} not found`,
        );
        await this.endSession(session.id);
        break;
      }

      const shouldConsumeInput = isInputResumption && isFirstNode;

      const result = await this.executeNodeWithTimeout(
        currentNode,
        session,
        message,
        flowStructure,
        companyId,
        conversationId,
        shouldConsumeInput,
      );

      isFirstNode = false;

      if (result) {
        results.push(result);
      }

      const freshSession = await flowSessionRepository.findSession(session.id);

      if (!freshSession) break;

      session = {
        ...freshSession,
        variables: (freshSession.variables as FlowVariables) || {},
      };
    }

    if (loopCount >= MAX_LOOPS) {
      Logger.warn(
        `[FlowExecutor] ⚠️ Max loops exceeded for session ${session?.id}`,
      );
    }

    return results;
  }

  // ────────────────────────────────────────────────
  // NODE EXECUTION (Timeout + Dispatch)
  // ────────────────────────────────────────────────

  private async executeNodeWithTimeout(
    node: FlowNode,
    session: FlowSessionState,
    userMessage: string,
    flowStructure: FlowStructure,
    companyId: string,
    conversationId: string,
    shouldConsumeInput: boolean = false,
  ): Promise<FlowExecutionResult> {
    const timeout = node.type === "AI_AGENT" ? AI_TIMEOUT_MS : NODE_TIMEOUT_MS;

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(
          new Error(
            `Node ${node.id} (${node.type}) execution timeout after ${timeout}ms`,
          ),
        );
      }, timeout);
    });

    try {
      const result = await Promise.race([
        this.executeNode(
          node,
          session,
          userMessage,
          flowStructure,
          companyId,
          conversationId,
          shouldConsumeInput,
        ),
        timeoutPromise,
      ]);

      return result;
    } catch (error: unknown) {
      const errorMsg = getErrorMessage(error);

      if (errorMsg.includes("timeout")) {
        Logger.error(
          `[FlowExecutor] 🚨 TIMEOUT: Node ${node.id} (${node.type}) took longer than ${timeout}ms`,
        );
        await this.endSession(session.id);
        return "Lo siento, el proceso está tardando más de lo esperado. Por favor, contacta con soporte.";
      }

      throw error;
    }
  }

  private async executeNode(
    node: FlowNode,
    session: FlowSessionState,
    userMessage: string,
    flowStructure: FlowStructure,
    companyId: string,
    conversationId: string,
    shouldConsumeInput: boolean = false,
  ): Promise<FlowExecutionResult> {
    Logger.info(
      `[FlowExecutor] Executing node ${node.id} of type ${node.type}`,
    );

    const visitedNodes = [...session.visitedNodes, node.id];
    await flowSessionRepository.updateSession(session.id, {
      visitedNodes,
      lastStepAt: new Date(),
    });

    const strNodeType = node.type.toUpperCase();

    // Bind navigation helpers for handlers
    const moveNext = this.moveToNextNode.bind(this);
    const moveSpecific = this.moveToSpecificNode.bind(this);
    const endSess = this.endSession.bind(this);

    switch (strNodeType) {
      case "SEND_MESSAGE":
      case "MESSAGE":
      case "SEND_IMAGE":
      case "SEND_VIDEO":
      case "SEND_AUDIO":
      case "SEND_DOCUMENT":
        return await this.nodeHandlers.handleSendNode(
          node,
          session,
          flowStructure,
          moveNext,
        );

      case "ASK_DATA":
        return await this.nodeHandlers.handleAskDataNode(
          node,
          session,
          userMessage,
          flowStructure,
          shouldConsumeInput,
          moveNext,
        );

      case "CONDITION":
        return await this.nodeHandlers.handleConditionNode(
          node,
          session,
          userMessage,
          flowStructure,
          moveSpecific,
          endSess,
        );

      case "AI_AGENT":
        return await this.nodeHandlers.handleAIAgentNode(
          node,
          session,
          userMessage,
          flowStructure,
          moveNext,
        );

      case "CREATE_DEAL":
        return await this.nodeHandlers.handleCreateDealNode(
          node,
          session,
          companyId,
          flowStructure,
          moveNext,
        );

      case "UPDATE_CONTACT":
        return await this.nodeHandlers.handleUpdateContactNode(
          node,
          session,
          flowStructure,
          moveNext,
        );

      case "ASSIGN_AGENT":
        return await this.nodeHandlers.handleAssignAgentNode(
          node,
          session,
          conversationId,
          endSess,
        );

      case "AI_HANDOFF":
        return await this.nodeHandlers.handleHandoffNode(
          node,
          session,
          conversationId,
          endSess,
        );

      case "DELAY":
        return await this.nodeHandlers.handleDelayNode(
          node,
          session,
          flowStructure,
          moveNext,
        );

      case "END":
        await this.endSession(session.id);
        return node.data.message || "¡Gracias por tu tiempo!";

      default:
        Logger.warn(`[FlowExecutor] Unknown node type: ${node.type}`);
        await this.moveToNextNode(session.id, node.id, flowStructure);
        return null;
    }
  }

  // ────────────────────────────────────────────────
  // SESSION MANAGEMENT
  // ────────────────────────────────────────────────

  private async getFlowCached(flowId: string) {
    return await cacheService.wrap(
      `workflow:${flowId}`,
      async () => {
        return flowSessionRepository.findWorkflow(flowId);
      },
      3600,
    );
  }

  private async getActiveSession(
    contactId: string,
  ): Promise<FlowSessionState | null> {
    const session = await flowSessionRepository.findActiveSession(contactId);

    if (session && session.flow && session.flow.isActive) {
      return toFlowSessionState(session);
    }

    return null;
  }

  private async checkTriggers(
    contactId: string,
    message: string,
    companyId: string,
    conversationId: string,
    activeFlowId?: string,
  ): Promise<FlowSessionState | null> {
    const flows = await flowSessionRepository.findActiveWorkflowsByTrigger(
      companyId,
      "KEYWORD",
    );

    const messageLower = message.toLowerCase().trim();

    for (const flow of flows) {
      if (activeFlowId && flow.id === activeFlowId) {
        continue;
      }

      const triggerData =
        flow.triggerConfig as unknown as KeywordTriggerData | null;

      const safeData = (triggerData || {}) as Record<string, unknown>;

      let rawKeywords: unknown =
        safeData.keywords ||
        safeData.keyword ||
        safeData.words ||
        safeData.phrases ||
        [];

      if (typeof rawKeywords === "string") {
        rawKeywords = [rawKeywords];
      }

      const keywords: string[] = [];

      if (Array.isArray(rawKeywords)) {
        for (const k of rawKeywords) {
          if (typeof k === "string") {
            const parts = k
              .split(",")
              .map((s) => s.trim().toLowerCase())
              .filter((s) => s.length > 0);
            keywords.push(...parts);
          }
        }
      }

      for (const keyword of keywords) {
        if (messageLower.includes(keyword)) {
          Logger.info(
            `[FlowExecutor] Trigger match! Keyword: "${keyword}" found in message.`,
          );
          return await this.startNewSession(
            flow.id,
            contactId,
            companyId,
            conversationId,
          );
        }
      }
    }

    return null;
  }

  private async startNewSession(
    flowId: string,
    contactId: string,
    companyId: string,
    conversationId: string,
  ): Promise<FlowSessionState> {
    const flow = await this.getFlowCached(flowId);
    if (!flow) throw new Error("Flow not found");

    const flowStructure: FlowStructure = {
      nodes: (flow.nodes as unknown as FlowNode[]) || [],
      edges: (flow.edges as unknown as FlowEdge[]) || [],
    };

    let startNode = flowStructure.nodes.find(
      (n) =>
        n.type === "START" ||
        (n.type as string) === "start" ||
        (n.type as string) === "TRIGGER",
    );

    if (!startNode && flowStructure.nodes.length > 0) {
      Logger.warn(
        "[FlowExecutor] Explicit START node missing. Attempting to find topological root...",
      );

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
        Logger.info(
          `[FlowExecutor] Resolved implicit start node: ${startNode.id} (${startNode.type})`,
        );
      }
    }

    if (!startNode) {
      throw new Error("No START node found in flow (and no valid root node)");
    }

    await flowSessionRepository.deleteActiveSessions(contactId, flow.id);

    let newSession;
    try {
      newSession = await flowSessionRepository.createSession({
        contactId,
        flowId: flow.id,
        companyId,
        conversationId,
        currentNodeId: startNode?.id,
        isActive: true,
        variables: {},
        visitedNodes: startNode ? [startNode.id] : [],
      });
    } catch (err: unknown) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2003"
      ) {
        Logger.error(
          `[FlowExecutor] ❌ FK Violation: The Flow ID "${flow.id}" does not exist in the 'workflows' table. Cache might be stale.`,
        );
        await cacheService.delete(`workflow:${flow.id}`);
      }
      throw err;
    }

    Logger.info(
      `[FlowExecutor] Started new session ${newSession.id} for contact ${contactId}`,
    );

    return toFlowSessionState(newSession) as FlowSessionState;
  }

  // ────────────────────────────────────────────────
  // NAVIGATION HELPERS
  // ────────────────────────────────────────────────

  private async moveToNextNode(
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

    if (variables) {
      updateData.variables = variables;
    }

    await flowSessionRepository.updateSession(sessionId, updateData);
  }

  private async moveToSpecificNode(
    sessionId: string,
    targetNodeId: string,
    _flowStructure: FlowStructure,
  ): Promise<void> {
    await flowSessionRepository.updateSession(sessionId, {
      currentNodeId: targetNodeId,
      lastStepAt: new Date(),
    });
  }

  private async endSession(sessionId: string): Promise<void> {
    await flowSessionRepository.deleteSession(sessionId);
    Logger.info(`[FlowExecutor] Session ${sessionId} ended`);
  }
}

export const flowExecutor = new FlowExecutorService();
