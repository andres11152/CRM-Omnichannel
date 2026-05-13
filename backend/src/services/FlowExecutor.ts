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
 * 
 *  STEP-BY-STEP EXECUTION:
 * Output nodes (SEND_MESSAGE, SEND_IMAGE, etc.) return ONE result at a time,
 * then schedule continuation via BullMQ so the user sees a natural conversation.
 * Only silent/logic nodes (CONDITION, CREATE_DEAL, etc.) execute synchronously
 * within the same loop iteration.
 */

import { ContactFlowSession } from "@prisma/client";
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
import { flowQueueService } from "./queue/flowQueueService";

// [SEC] TIMEOUT CONFIGURATION
const NODE_TIMEOUT_MS = 30000;
const AI_TIMEOUT_MS = 45000;

// Delay between consecutive output messages (ms) for natural conversation pacing
const STEP_DELAY_MS = 1200;

/** Node types that produce visible output to the user */
const OUTPUT_NODE_TYPES = new Set([
  "SEND_MESSAGE",
  "SEND_IMAGE",
  "SEND_VIDEO",
  "SEND_AUDIO",
  "SEND_DOCUMENT",
  "MESSAGE",
  "END",
  "AI_HANDOFF",
]);

/** Node types that are silent/logic and should chain immediately */
const SILENT_NODE_TYPES = new Set([
  "CONDITION",
  "CREATE_DEAL",
  "UPDATE_CONTACT",
  "HTTP_REQUEST",
  "TAG_CONTACT",
  "SEND_TEMPLATE",
  "DELAY",
  "START",
  "TRIGGER",
]);

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

    // Wake up session in database
    await flowSessionRepository.updateSession(sessionId, { isPaused: false });

    // Wake up session in state object passed to the execution loop
    const sessionState = this.toState(sessionPrisma);
    sessionState.isPaused = false;

    return await this.runFlowLoop(
      sessionState,
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
      return ["A technical error occurred processing your request."];
    }
  }

  // ────────────────────────────────────────────────
  // CORE EXECUTION LOOP (STEP-BY-STEP)
  // ────────────────────────────────────────────────
  //
  // Architecture:
  // 1. Execute the current node
  // 2. If the node produces VISIBLE output (send_message, send_image, etc.)
  //    → Return that single result immediately
  //    → Schedule continuation via BullMQ so the next node runs after a delay
  // 3. If the node is SILENT (condition, create_deal, etc.)
  //    → Continue to the next node in the same iteration (no output to user)
  // 4. If the node PAUSES (ask_data, delay)
  //    → Return the question/null and stop (session is paused in DB)

  private async runFlowLoop(
    initialSession: FlowSessionState,
    message: string,
    companyId: string,
    conversationId: string,
    isInputResumption: boolean = false,
  ): Promise<FlowExecutionResult[]> {
    const results: FlowExecutionResult[] = [];
    const MAX_LOOPS = 20; // Safety net for infinite loops
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

      const nodeTypeUpper = node.type.toUpperCase();

      // Skip START/TRIGGER nodes (they're just entry points)
      if (nodeTypeUpper === "START" || nodeTypeUpper === "TRIGGER") {
        await this.navigation.moveToNextNode(session.id, node.id, struct);
        const fresh = await flowSessionRepository.findSession(session.id);
        if (!fresh) break;
        session = this.toState(fresh);
        isFirstNode = false;
        continue;
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

      isFirstNode = false;

      // Reload session state from DB
      const fresh = await flowSessionRepository.findSession(session.id);
      if (!fresh) break;
      session = this.toState(fresh);

      // ── Decision: Should we yield or continue? ──

      if (session.isPaused) {
        // Node paused the session (ASK_DATA or DELAY)
        // Return whatever result (question prompt) and stop
        if (result) results.push(result);
        break;
      }

      if (result && OUTPUT_NODE_TYPES.has(nodeTypeUpper)) {
        // This node produced visible output → return it and schedule continuation
        results.push(result);

        if (session.isActive && !session.isPaused) {
          // Schedule the next step with a natural delay
          await flowSessionRepository.updateSession(session.id, { isPaused: true });
          await flowQueueService.scheduleResume(session.id, STEP_DELAY_MS);
          Logger.info(`[FlowExec] [STEP] Output sent for ${node.id}, scheduling next step in ${STEP_DELAY_MS}ms`);
        }
        break; // Return this single output to the caller
      }

      // Silent node (condition, CRM action, etc.) → result is null or internal, keep looping
      if (result) results.push(result);
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
        return "Process timed out. Please try again.";
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
    Logger.info(`[FlowExec] [NODE] Executing ${node.id} (${node.type})`);

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

      case "AI_HANDOFF":
        return this.nodeHandlers.handleHandoffNode(node, session, conversationId, endSess);

      case "HTTP_REQUEST":
        return this.nodeHandlers.handleHttpRequestNode(node, session, struct, moveNext);

      case "TAG_CONTACT":
        return this.nodeHandlers.handleTagContactNode(node, session, struct, moveNext);

      case "SEND_TEMPLATE":
        return this.nodeHandlers.handleSendTemplateNode(node, session, struct, moveNext);

      case "DELAY":
        return this.nodeHandlers.handleDelayNode(node, session, struct, moveNext);

      case "END":
        await this.navigation.endSession(session.id);
        return node.data.message || "Thank you!";

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
