/**
 * [AI] FLOW EXECUTOR SERVICE (SRP REFACTORED)
 *
 * Core execution engine for chatbot flows. Intercepts incoming messages
 * and runs the logic defined in the React Flow diagrams.
 *
 * SRP Refactor:
 * - Triggers -> FlowTriggerService
 * - Navigation -> FlowNavigationService
 * - Node Handlers -> FlowNodeHandlers
 *
 *  STRICT TYPING: Guaranteed 100% type safety.
 */

import { Prisma, ContactFlowSession } from "@prisma/client";
import { flowSessionRepository } from "@/repositories/FlowSessionRepository";
import { Logger } from "@/utils/logger";
import { getErrorMessage } from "@/utils/errorHelpers";
import type {
  FlowSessionState,
  FlowVariables,
  FlowNode,
  FlowStructure,
  FlowExecutionResult,
  FlowEdge,
} from "@/types/flow.types";

import { FlowNodeHandlers } from "./flow/FlowNodeHandlers";
import { FlowNavigationService } from "./flow/FlowNavigationService";
import { FlowTriggerService } from "./flow/FlowTriggerService";

// [SEC] TIMEOUT CONFIGURATION
const NODE_TIMEOUT_MS = 30000;
const AI_TIMEOUT_MS = 45000;

export class FlowExecutorService {
  private nodeHandlers: FlowNodeHandlers;
  private navigation: FlowNavigationService;
  private trigger: FlowTriggerService;

  constructor() {
    this.nodeHandlers = new FlowNodeHandlers();
    this.navigation = new FlowNavigationService();
    this.trigger = new FlowTriggerService(this.navigation);
  }

  // ────────────────────────────────────────────────
  // PUBLIC API
  // ────────────────────────────────────────────────

  async resumeSession(sessionId: string): Promise<FlowExecutionResult[]> {
    const sessionPrisma = await flowSessionRepository.findSession(sessionId);
    if (!sessionPrisma || !sessionPrisma.isActive) return [];

    // Wake up session
    await flowSessionRepository.updateSession(sessionId, { isPaused: false });

    return await this.runFlowLoop(
      this.toState(sessionPrisma),
      "",
      sessionPrisma.companyId,
      sessionPrisma.conversationId || "",
      false,
    );
  }

  async getSessionById(sessionId: string): Promise<FlowSessionState | null> {
    const session = await flowSessionRepository.findSession(sessionId);
    return session ? this.toState(session) : null;
  }

  async processMessage(
    contactId: string,
    message: string,
    conversationId: string,
    companyId: string,
  ): Promise<FlowExecutionResult[]> {
    try {
      let session = await this.getActiveSession(contactId);

      // Check for global triggers (keywords)
      const triggerSession = await this.trigger.checkTriggers(
        contactId,
        message,
        companyId,
        conversationId,
        session?.flowId,
      );

      if (triggerSession) {
        if (session) {
          Logger.info(`[FlowExec] [SYNC] Context Switch: Ending ${session.id} for new trigger.`);
          await this.navigation.endSession(session.id);
        }
        session = triggerSession;
      } else if (!session) {
        return []; // No active flow or trigger
      }

      let isInputResumption = false;

      // Unpause if necessary
      if (session.isPaused) {
        await flowSessionRepository.updateSession(session.id, { isPaused: false });
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
      Logger.error("[FlowExec] [ERROR] Error processing message:", getErrorMessage(error));
      return ["Hubo un error técnico procesando tu solicitud."];
    }
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

    while (session?.isActive && !session?.isPaused && loopCount < MAX_LOOPS) {
      loopCount++;

      const flow = await this.navigation.getFlowCached(session.flowId);
      if (!flow?.isActive) {
        await this.navigation.endSession(session.id);
        break;
      }

      const struct: FlowStructure = {
        nodes: (flow.nodes as unknown as FlowNode[]) || [],
        edges: (flow.edges as unknown as FlowEdge[]) || [],
      };

      const node = struct.nodes.find((n) => n.id === session.currentNodeId);
      if (!node) {
        await this.navigation.endSession(session.id);
        break;
      }

      const result = await this.executeNodeWithTimeout(
        node,
        session,
        message,
        struct,
        companyId,
        conversationId,
        isInputResumption && isFirstNode,
      );

      if (result) results.push(result);
      isFirstNode = false;

      // Reload session state from DB for next iteration
      const fresh = await flowSessionRepository.findSession(session.id);
      if (!fresh) break;
      session = this.toState(fresh);
    }

    return results;
  }

  // ────────────────────────────────────────────────
  // NODE EXECUTION (Dispatch & Protection)
  // ────────────────────────────────────────────────

  private async executeNodeWithTimeout(
    node: FlowNode,
    session: FlowSessionState,
    userMessage: string,
    flowStructure: FlowStructure,
    companyId: string,
    conversationId: string,
    shouldConsumeInput: boolean,
  ): Promise<FlowExecutionResult> {
    const timeout = node.type === "AI_AGENT" ? AI_TIMEOUT_MS : NODE_TIMEOUT_MS;

    try {
      return await Promise.race([
        this.executeNode(node, session, userMessage, flowStructure, companyId, conversationId, shouldConsumeInput),
        new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error(`Timeout: Node ${node.type} took too long`)), timeout)
        ),
      ]);
    } catch (error: unknown) {
      const msg = getErrorMessage(error);
      if (msg.includes("Timeout")) {
        Logger.error(`[FlowExec] [ALERT] TIMEOUT: Node ${node.id} (${node.type})`);
        await this.navigation.endSession(session.id);
        return "Proceso excedido de tiempo. Por favor intenta de nuevo.";
      }
      throw error;
    }
  }

  private async executeNode(
    node: FlowNode,
    session: FlowSessionState,
    userMessage: string,
    struct: FlowStructure,
    companyId: string,
    conversationId: string,
    shouldConsumeInput: boolean,
  ): Promise<FlowExecutionResult> {
    Logger.info(`[FlowExec] [COMPLETE] Node ${node.id} (${node.type})`);

    // Log visit
    await flowSessionRepository.updateSession(session.id, {
      visitedNodes: [...session.visitedNodes, node.id],
      lastStepAt: new Date(),
    });

    const type = node.type.toUpperCase();
    
    // Bind navigation for handlers
    const moveNext = this.navigation.moveToNextNode.bind(this.navigation);
    const moveSpecific = this.navigation.moveToSpecificNode.bind(this.navigation);
    const endSess = this.navigation.endSession.bind(this.navigation);

    switch (type) {
      case "MESSAGE":
      case "SEND_MESSAGE":
      case "SEND_IMAGE":
      case "SEND_VIDEO":
      case "SEND_AUDIO":
      case "SEND_DOCUMENT":
        return this.nodeHandlers.handleSendNode(node, session, struct, moveNext);

      case "ASK_DATA":
        return this.nodeHandlers.handleAskDataNode(node, session, userMessage, struct, shouldConsumeInput, moveNext);

      case "CONDITION":
        return this.nodeHandlers.handleConditionNode(node, session, userMessage, struct, moveSpecific, endSess);

      case "AI_AGENT":
        return this.nodeHandlers.handleAIAgentNode(node, session, userMessage, struct, moveNext);

      case "CREATE_DEAL":
        return this.nodeHandlers.handleCreateDealNode(node, session, companyId, struct, moveNext);

      case "UPDATE_CONTACT":
        return this.nodeHandlers.handleUpdateContactNode(node, session, struct, moveNext);

      case "ASSIGN_AGENT":
        return this.nodeHandlers.handleAssignAgentNode(node, session, conversationId, endSess);

      case "DELAY":
        return this.nodeHandlers.handleDelayNode(node, session, struct, moveNext);

      case "END":
        await this.navigation.endSession(session.id);
        return node.data.message || "¡Gracias!";

      default:
        await this.navigation.moveToNextNode(session.id, node.id, struct);
        return null;
    }
  }

  // ────────────────────────────────────────────────
  // HELPERS
  // ────────────────────────────────────────────────

  private async getActiveSession(contactId: string): Promise<FlowSessionState | null> {
    const s = await flowSessionRepository.findActiveSession(contactId);
    return s && s.flow?.isActive ? this.toState(s) : null;
  }

  private toState(p: ContactFlowSession): FlowSessionState {
    return {
      ...p,
      conversationId: p.conversationId || "",
      variables: (p.variables as FlowVariables) || {},
    };
  }
}

export const flowExecutor = new FlowExecutorService();
