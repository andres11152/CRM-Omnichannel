/**
 * 🧩 FLOW NODE HANDLERS (Refactored Facade)
 *
 * Messaging and navigation node handlers:
 * - SEND_MESSAGE / SEND_IMAGE / SEND_VIDEO / SEND_AUDIO / SEND_DOCUMENT
 * - ASK_DATA (input collection with pause/resume)
 * - CONDITION (branching logic)
 * - ASSIGN_AGENT / AI_HANDOFF (routing)
 * - DELAY (scheduled resume)
 *
 * AI and CRM logic delegated to FlowAIHandler and FlowCRMHandler.
 */

import { flowSessionRepository } from "@/repositories/FlowSessionRepository";
import { conversationRepository } from "@/repositories/ConversationRepository";
import { Logger } from "@/utils/logger";
import { flowQueueService } from "../queue/flowQueueService";
import { Prisma } from "@prisma/client";
import type {
  FlowSessionState,
  FlowVariables,
  FlowNode,
  FlowStructure,
  FlowMediaResponse,
} from "@/types/flow.types";
import { FlowAIHandler } from "./FlowAIHandler";
import { FlowCRMHandler } from "./FlowCRMHandler";

export class FlowNodeHandlers {
  private aiHandler: FlowAIHandler;
  private crmHandler: FlowCRMHandler;

  constructor() {
    this.aiHandler = new FlowAIHandler();
    this.crmHandler = new FlowCRMHandler();
  }

  // ────────────────────────────────────────────────
  // SEND NODE (Message, Image, Video, Audio, Document)
  // ────────────────────────────────────────────────

  async handleSendNode(
    node: FlowNode,
    session: FlowSessionState,
    flowStructure: FlowStructure,
    moveToNextNode: (
      sessionId: string,
      currentNodeId: string,
      flowStructure: FlowStructure,
    ) => Promise<void>,
  ): Promise<string | FlowMediaResponse> {
    const nodeType = node.type.toLowerCase();
    const replaceVars = (text: string) =>
      this.replaceVariables(text, session.variables);

    let response: string | FlowMediaResponse;

    switch (nodeType) {
      case "send_message":
        response = replaceVars(
          node.data.message || node.data.content || node.data.text || "",
        );
        break;

      case "send_image":
        response = {
          type: "image",
          url: replaceVars(node.data.mediaUrl || node.data.imageUrl || ""),
          message: node.data.message
            ? replaceVars(node.data.message)
            : undefined,
        };
        break;

      case "send_video":
        response = {
          type: "video",
          url: replaceVars(node.data.mediaUrl || node.data.videoUrl || ""),
          message: node.data.message
            ? replaceVars(node.data.message)
            : undefined,
        };
        break;

      case "send_audio":
        response = {
          type: "audio",
          url: replaceVars(node.data.mediaUrl || node.data.audioUrl || ""),
        };
        break;

      case "send_document":
        response = {
          type: "document",
          url: replaceVars(node.data.mediaUrl || node.data.documentUrl || ""),
          filename: node.data.filename
            ? replaceVars(node.data.filename)
            : undefined,
        };
        break;

      default:
        response = replaceVars(node.data.message || node.data.content || "");
    }

    await moveToNextNode(session.id, node.id, flowStructure);
    return response;
  }

  // ────────────────────────────────────────────────
  // ASK DATA NODE (Input Collection)
  // ────────────────────────────────────────────────

  async handleAskDataNode(
    node: FlowNode,
    session: FlowSessionState,
    userMessage: string,
    flowStructure: FlowStructure,
    shouldConsumeInput: boolean,
    moveToNextNode: (
      sessionId: string,
      currentNodeId: string,
      flowStructure: FlowStructure,
      variables?: FlowVariables,
    ) => Promise<void>,
  ): Promise<string | null> {
    const variableName = node.data.variable || "response";
    const question = node.data.question;

    if (!shouldConsumeInput) {
      await flowSessionRepository.updateSession(session.id, {
        currentNodeId: node.id,
        isPaused: true,
      });

      if (question && question.trim() !== "") {
        return this.replaceVariables(question, session.variables);
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
      return this.replaceVariables(confirmation, updatedVariables);
    }

    return null;
  }

  // ────────────────────────────────────────────────
  // CONDITION NODE (Branching)
  // ────────────────────────────────────────────────

  async handleConditionNode(
    node: FlowNode,
    session: FlowSessionState,
    userMessage: string,
    flowStructure: FlowStructure,
    moveToSpecificNode: (
      sessionId: string,
      targetNodeId: string,
      flowStructure: FlowStructure,
    ) => Promise<void>,
    endSession: (sessionId: string) => Promise<void>,
  ): Promise<string | null> {
    const conditions = node.data.conditions || [];
    const variable = node.data.variable || "last_response";
    const valueToCheck = String(session.variables[variable] ?? userMessage);

    for (const condition of conditions) {
      const { operator, value, targetHandle } = condition;

      let matched = false;
      switch (operator) {
        case "equals":
          matched = valueToCheck.toLowerCase() === value.toLowerCase();
          break;
        case "contains":
          matched = valueToCheck.toLowerCase().includes(value.toLowerCase());
          break;
        case "greater_than":
          matched = parseFloat(valueToCheck) > parseFloat(value);
          break;
        case "less_than":
          matched = parseFloat(valueToCheck) < parseFloat(value);
          break;
      }

      if (matched) {
        const edge = flowStructure.edges.find(
          (e) => e.source === node.id && e.sourceHandle === targetHandle,
        );

        if (edge) {
          await moveToSpecificNode(session.id, edge.target, flowStructure);
          return null;
        }
      }
    }

    const defaultEdge = flowStructure.edges.find(
      (e) => e.source === node.id && !e.sourceHandle,
    );

    if (defaultEdge) {
      await moveToSpecificNode(session.id, defaultEdge.target, flowStructure);
    } else {
      await endSession(session.id);
    }

    return null;
  }

  // ────────────────────────────────────────────────
  // AI AGENT NODE (Delegated to FlowAIHandler)
  // ────────────────────────────────────────────────

  async handleAIAgentNode(
    node: FlowNode,
    session: FlowSessionState,
    userMessage: string,
    flowStructure: FlowStructure,
    moveToNextNode: (
      sessionId: string,
      currentNodeId: string,
      flowStructure: FlowStructure,
      variables?: FlowVariables,
    ) => Promise<void>,
  ): Promise<string> {
    return this.aiHandler.handleAIAgentNode(
      node,
      session,
      userMessage,
      flowStructure,
      moveToNextNode,
    );
  }

  // ────────────────────────────────────────────────
  // CRM NODES (Delegated to FlowCRMHandler)
  // ────────────────────────────────────────────────

  async handleCreateDealNode(
    node: FlowNode,
    session: FlowSessionState,
    companyId: string,
    flowStructure: FlowStructure,
    moveToNextNode: (
      sessionId: string,
      currentNodeId: string,
      flowStructure: FlowStructure,
    ) => Promise<void>,
  ): Promise<string | null> {
    return this.crmHandler.handleCreateDealNode(
      node,
      session,
      companyId,
      flowStructure,
      moveToNextNode,
    );
  }

  async handleUpdateContactNode(
    node: FlowNode,
    session: FlowSessionState,
    flowStructure: FlowStructure,
    moveToNextNode: (
      sessionId: string,
      currentNodeId: string,
      flowStructure: FlowStructure,
    ) => Promise<void>,
  ): Promise<string | null> {
    return this.crmHandler.handleUpdateContactNode(
      node,
      session,
      flowStructure,
      moveToNextNode,
    );
  }

  // ────────────────────────────────────────────────
  // ASSIGN AGENT NODE
  // ────────────────────────────────────────────────

  async handleAssignAgentNode(
    node: FlowNode,
    session: FlowSessionState,
    conversationId: string,
    endSession: (sessionId: string) => Promise<void>,
  ): Promise<string | null> {
    const { assignmentType, agentId, queueId, message } = node.data;

    type EnterpriseRoutingUpdate = Prisma.ConversationUpdateInput & {
      queueId?: string | null;
      assignedToId?: string | null;
      status?: string | Prisma.EnumConversationStatusFieldUpdateOperationsInput;
    };

    const updateData: EnterpriseRoutingUpdate = {};
    let logMsg = "";

    if (assignmentType === "queue" && queueId) {
      updateData.status = "OPEN";
      updateData.queueId = queueId;
      updateData.assignedToId = null;
      logMsg = `Routed to Queue ${queueId}`;
    } else if (agentId) {
      updateData.status = "IN_PROGRESS";
      updateData.assignedToId = agentId;
      logMsg = `Assigned to Agent ${agentId}`;
    } else {
      updateData.status = "OPEN";
      logMsg = "Moved to General Inbox (No routing target defined)";
    }

    await conversationRepository.update(
      conversationId,
      updateData as Prisma.ConversationUpdateInput,
    );

    Logger.info(`[FlowExecutor] Handoff executed: ${logMsg}`);
    await endSession(session.id);

    return message || "Te estamos conectando con nuestro equipo...";
  }

  // ────────────────────────────────────────────────
  // HANDOFF NODE
  // ────────────────────────────────────────────────

  async handleHandoffNode(
    node: FlowNode,
    session: FlowSessionState,
    conversationId: string,
    endSession: (sessionId: string) => Promise<void>,
  ): Promise<string> {
    await conversationRepository.update(conversationId, {
      status: "IN_PROGRESS",
    });

    await endSession(session.id);
    return node.data.message || "Un agente tomará tu caso en breve.";
  }

  // ────────────────────────────────────────────────
  // DELAY NODE
  // ────────────────────────────────────────────────

  async handleDelayNode(
    node: FlowNode,
    session: FlowSessionState,
    flowStructure: FlowStructure,
    moveToNextNode: (
      sessionId: string,
      currentNodeId: string,
      flowStructure: FlowStructure,
    ) => Promise<void>,
  ): Promise<string | null> {
    const duration = parseInt(node.data.content || "5") * 1000;

    await moveToNextNode(session.id, node.id, flowStructure);
    await flowQueueService.scheduleResume(session.id, duration);
    await flowSessionRepository.updateSession(session.id, { isPaused: true });

    return null;
  }

  // ────────────────────────────────────────────────
  // UTILITY
  // ────────────────────────────────────────────────

  replaceVariables(text: string, variables: FlowVariables): string {
    let result = text;
    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`{{${key}}}`, "g");
      result = result.replace(regex, String(value));
    }
    return result;
  }
}

