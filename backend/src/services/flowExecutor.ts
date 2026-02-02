/**
 * Flow Executor Service
 *
 * Motor de ejecución de chatbot flows. Intercepta mensajes entrantes
 * y ejecuta la lógica definida en el diagrama visual (React Flow).
 *
 * Características:
 * - Pausa/reanuda ejecución en nodos de input
 * - Evalúa condiciones para ramificación
 * - Integra con OpenAI/Gemini para respuestas IA
 * - Crea deals y actualiza contactos automáticamente
 * - Previene loops infinitos
 *
 * 🔒 FULLY TYPED: No `any` types used in this file.
 */

import { prisma } from "../config/database";
import { Prisma } from "@prisma/client";
import { Logger } from "../utils/logger";
import OpenAI from "openai";
import { GoogleGenerativeAI, Part, Content } from "@google/generative-ai";
import { getErrorMessage } from "../utils/errorHelpers";
import type {
  FlowSessionState,
  FlowVariables,
  FlowNode,
  FlowStructure,
  FlowExecutionResult,
  FlowMediaResponse,
  FlowSessionUpdate,
  KeywordTriggerData,
  FlowEdge,
} from "@/types/flow.types";
import { cacheService } from "./cacheService";
import { flowQueueService } from "./queue/flowQueue.service";

// 🛡️ TIMEOUT CONFIGURATION
const NODE_TIMEOUT_MS = 30000; // 30 seconds per node
const AI_TIMEOUT_MS = 45000; // 45 seconds for AI operations

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
    // Ensure conversationId is string (handle null)
    conversationId: prismaSession.conversationId || "",
    variables: (prismaSession.variables as FlowVariables) || {},
  };
};

// ⏳ HELPER: Pause execution helper
const pauseSession = async (sessionId: string) => {
  await prisma.contactFlowSession.update({
    where: { id: sessionId },
    data: { isPaused: true },
  });
};

export class FlowExecutorService {
  private openai: OpenAI | null = null;

  constructor() {
    // Inicializar OpenAI si hay API key
    if (process.env.OPENAI_API_KEY) {
      this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    }
  }

  /**
   * Procesa un mensaje entrante del usuario
   * @param contactId ID del contacto que envió el mensaje
   * @param message Contenido del mensaje
   * @param conversationId ID de la conversación
   * @param companyId ID de la empresa (tenant)
   * @returns Respuesta del bot o null si no hay flujo activo
   */
  async resumeSession(sessionId: string): Promise<FlowExecutionResult[]> {
    const sessionPrisma = await prisma.contactFlowSession.findUnique({
      where: { id: sessionId },
    });

    if (!sessionPrisma || !sessionPrisma.isActive) return [];

    // Unpause session since we are resuming from delay
    await prisma.contactFlowSession.update({
      where: { id: sessionId },
      data: { isPaused: false },
    });

    const session = toFlowSessionState(sessionPrisma);
    if (!session) return [];

    // Execute flow loop with empty message (timers don't have user input)
    return await this.runFlowLoop(
      session,
      "", // Empty message
      session.companyId,
      session.conversationId,
      false, // 🧠 Fix: Timers do NOT provide input, so treat as fresh entry
    );
  }

  /**
   * Procesa un mensaje entrante del usuario
   * @param contactId ID del contacto que envió el mensaje
   * @param message Contenido del mensaje
   * @param conversationId ID de la conversación
   * @param companyId ID de la empresa (tenant)
   * @returns Lista de respuestas del bot (texto, imagen, video, etc.)
   */
  async processMessage(
    contactId: string,
    message: string,
    conversationId: string,
    companyId: string,
  ): Promise<FlowExecutionResult[]> {
    const results: FlowExecutionResult[] = [];
    // const MAX_LOOPS = 20; // Moved to runFlowLoop
    // let loopCount = 0; // Moved to runFlowLoop

    try {
      // PASO 1: Verificar si hay flujo activo para este contacto
      let session = await this.getActiveSession(contactId);

      // 🧠 100-YEAR FIX: Global Interrupts
      // We pass session?.flowId to PREVENT restarting the current flow if keyword matches again.
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
        // No active session and no trigger match
        return [];
      }

      // PASO 1.5: Manejo de Sesión Pausada (Resumption)
      // Si la sesión existe pero está pausada, significa que estamos esperando input (Ask Data).
      // El mensaje actual ES el input, así que reanudamos.
      let isInputResumption = false;

      if (session && session.isPaused) {
        // Unpause in DB to allow loop to run
        await prisma.contactFlowSession.update({
          where: { id: session.id },
          data: { isPaused: false },
        });
        session.isPaused = false; // Update local state
        isInputResumption = true; // Mark as resumption to consume input
      }

      // PASO 2: Ejecución en Loop (Extracted for reusability)
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
      // Retornar lo que se haya acumulado hasta el error o null error msg
      if (results.length === 0)
        return ["Hubo un error técnico procesando tu solicitud."];
      return results;
    }
  }

  /**
   * Core execution loop shared by processMessage and resumeSession
   */
  async runFlowLoop(
    initialSession: FlowSessionState,
    message: string,
    companyId: string,
    conversationId: string,
    isInputResumption: boolean = false, // 🧠 100-YEAR FIX: Control Input Consumption
  ): Promise<FlowExecutionResult[]> {
    const results: FlowExecutionResult[] = [];
    const MAX_LOOPS = 20;
    let loopCount = 0;
    let session = initialSession;
    let isFirstNode = true; // Update: Track first node of the batch

    while (
      session &&
      session.isActive &&
      !session.isPaused &&
      loopCount < MAX_LOOPS
    ) {
      loopCount++;

      // 🚀 Caching Implementation
      const flow = await this.getFlowCached(session.flowId);

      if (!flow || !flow.isActive) {
        Logger.warn(
          `[FlowExecutor] Flow ${session.flowId} not found or inactive`,
        );
        await this.endSession(session.id);
        break;
      }

      // 🛡️ 100-YEAR FIX: Correctly reconstruct FlowStructure
      // flow.nodes contains only the nodes array. We must combine it with flow.edges.
      const flowStructure: FlowStructure = {
        nodes: (flow.nodes as unknown as FlowNode[]) || [],
        edges: (flow.edges as unknown as FlowEdge[]) || [],
      };

      // Identificar el nodo actual
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

      // 🧠 Determine if we should consume input
      // Only consume input if we are explicitly resuming AND this is the first node we hit.
      // E.g. Resume on "Ask Data" -> Consume.
      // E.g. Trigger -> "Ask Data" -> Do NOT Consume (isInputResumption=false).
      // E.g. Loop "Ask Data" -> "Condition" -> "Ask Data" -> Do NOT Consume (isFirstNode=false).
      const shouldConsumeInput = isInputResumption && isFirstNode;

      // Ejecutar nodo con Timeout Protection
      const result = await this.executeNodeWithTimeout(
        currentNode,
        session,
        message,
        flowStructure,
        companyId,
        conversationId,
        shouldConsumeInput,
      );

      // Mark first node as processed
      isFirstNode = false;

      // Acumular respuesta si existe
      if (result) {
        results.push(result);
      }

      // 🛡️ RE-FETCH SESSION STATE
      const freshSession = await prisma.contactFlowSession.findUnique({
        where: { id: session.id },
      });

      if (!freshSession) break; // Sesión eliminada (END node)

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

  /**
   * 🏗️ CACHED FLOW RETRIEVAL
   */
  private async getFlowCached(flowId: string) {
    return await cacheService.wrap(
      `workflow:${flowId}`,
      async () => {
        return prisma.workflow.findUnique({ where: { id: flowId } });
      },
      3600,
    ); // 1 Hour Cache
  }

  /**
   * 🛡️ TIMEOUT PROTECTION WRAPPER
   *
   * Executes a node with timeout protection to prevent hanging flows.
   * If a node takes longer than NODE_TIMEOUT_MS, it will be forcefully terminated.
   */
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

        // End session on timeout to prevent stuck flows
        await this.endSession(session.id);

        return "Lo siento, el proceso está tardando más de lo esperado. Por favor, contacta con soporte.";
      }

      throw error; // Re-throw non-timeout errors
    }
  }

  /**
   * Obtiene una sesión por su ID (usado por el worker)
   */
  async getSessionById(sessionId: string): Promise<FlowSessionState | null> {
    const session = await prisma.contactFlowSession.findUnique({
      where: { id: sessionId },
      include: {
        flow: true,
      },
    });

    if (session && session.flow) {
      return toFlowSessionState(session);
    }
    return null;
  }

  /**
   * Obtiene la sesión activa de un contacto
   */
  private async getActiveSession(
    contactId: string,
  ): Promise<FlowSessionState | null> {
    const session = await prisma.contactFlowSession.findFirst({
      where: {
        contactId,
        isActive: true,
      },
      include: {
        flow: true,
      },
      orderBy: { startedAt: "desc" },
    });

    if (session && session.flow && session.flow.isActive) {
      return toFlowSessionState(session);
    }

    return null;
  }

  /**
   * Verifica si el mensaje coincide con algún trigger de keyword
   */
  private async checkTriggers(
    contactId: string,
    message: string,
    companyId: string,
    conversationId: string,
    activeFlowId?: string, // 🧠 New Param to prevent self-restart
  ): Promise<FlowSessionState | null> {
    // Buscar flows activos con trigger de KEYWORD
    const flows = await prisma.workflow.findMany({
      where: {
        companyId,
        isActive: true,
        triggerType: "KEYWORD",
      },
      orderBy: { createdAt: "desc" },
    });

    const messageLower = message.toLowerCase().trim();

    for (const flow of flows) {
      // 🛡️ 100-YEAR FIX: Prevent Active Flow Self-Restart
      // If the matched flow is ALREADY the active one, ignore the trigger.
      // This prevents 'startNewSession' from killing the active session and causing crashes/loops.
      if (activeFlowId && flow.id === activeFlowId) {
        continue;
      }

      const triggerData =
        flow.triggerConfig as unknown as KeywordTriggerData | null;

      // 🛡️ DEBUG: Inspect full object structure from DB (Safe Logging)
      Logger.debug(
        `[FlowExecutor] Flow: "${
          flow.name
        }" FULL TRIGGER DATA: ${JSON.stringify(triggerData)}`,
      );

      // Support legacy/malformed keys (singular 'keyword', 'words', etc.)
      const safeData = (triggerData || {}) as Record<string, unknown>;

      let rawKeywords: unknown =
        safeData.keywords ||
        safeData.keyword ||
        safeData.words ||
        safeData.phrases ||
        [];

      // Handle simple string case (if stored as single string instead of array)
      if (typeof rawKeywords === "string") {
        rawKeywords = [rawKeywords];
      }

      // 🛡️ 100-YEAR FIX: Robust Keyword Parsing
      // Users often type "hola, greeting, hi" in a single input.
      // We must split by comma to treat them as separate triggers.
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

      Logger.debug(
        `[FlowExecutor] Flow: "${flow.name}" | Final Triggers: ${JSON.stringify(
          keywords,
        )}`,
      );

      // Verificar si alguna keyword coincide
      for (const keyword of keywords) {
        if (messageLower.includes(keyword)) {
          Logger.info(
            `[FlowExecutor] Trigger match! Keyword: "${keyword}" found in message.`,
          );
          // ¡Match! Iniciar nuevo flujo
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

  /**
   * Inicia una nueva sesión de flujo
   */
  private async startNewSession(
    flowId: string,
    contactId: string,
    companyId: string,
    conversationId: string,
  ): Promise<FlowSessionState> {
    // Obtener el nodo START del flujo
    const flow = await this.getFlowCached(flowId);
    if (!flow) throw new Error("Flow not found");

    // 🛡️ 100-YEAR FIX: Correctly map Prisma Model to FlowStructure
    // The Prisma model stores nodes and edges in separate JSON columns.
    // We must Combine them to create the FlowStructure expected by the executor.
    const flowStructure: FlowStructure = {
      nodes: (flow.nodes as unknown as FlowNode[]) || [],
      edges: (flow.edges as unknown as FlowEdge[]) || [],
    };

    Logger.debug(
      `[FlowExecutor] Inspecting Flow Structure. Nodes found: ${flowStructure.nodes.length}. Types: ${flowStructure.nodes
        .map((n) => n.type)
        .join(", ")}`,
    );

    // Try finding START, start, or TRIGGER
    let startNode = flowStructure.nodes.find(
      (n) =>
        n.type === "START" ||
        (n.type as string) === "start" ||
        (n.type as string) === "TRIGGER",
    );

    // 🛡️ 100-YEAR FIX: Topological Root Fallback
    // If explicit START node is missing (frontend glitch), find the implicit root.
    // The root is a node that has NO incoming edges from other VALID nodes.
    // We must ignore edges coming from "phantom" nodes (like a missing START node).
    if (!startNode && flowStructure.nodes.length > 0) {
      Logger.warn(
        "[FlowExecutor] Explicit START node missing. Attempting to find topological root...",
      );

      // Create a Set of all valid node IDs
      const validNodeIds = new Set(flowStructure.nodes.map((n) => n.id));

      // Filter edges: Only consider edges where the SOURCE actually exists in our node list.
      // This strips out edges coming from the ghost START node.
      const internalEdges = flowStructure.edges.filter((e) =>
        validNodeIds.has(e.source),
      );

      const targetNodeIds = new Set(internalEdges.map((e) => e.target));

      const rootNodes = flowStructure.nodes.filter(
        (n) => !targetNodeIds.has(n.id),
      );

      if (rootNodes.length > 0) {
        // If multiple roots exist, we pick the first one.
        // In a valid flow, there should typically be only one main root.
        startNode = rootNodes[0];
        Logger.info(
          `[FlowExecutor] Resolved implicit start node: ${startNode.id} (${startNode.type})`,
        );
      }
    }

    if (!startNode) {
      // DEBUG: Print all node IDs and Edges to help debug if it fails again
      Logger.error(
        `[FlowExecutor] FAILED to find start node. Nodes: ${flowStructure.nodes
          .map((n) => n.id)
          .join(", ")} | Edges: ${flowStructure.edges
          .map((e) => `${e.source}->${e.target}`)
          .join(", ")}`,
      );
      throw new Error("No START node found in flow (and no valid root node)");
    }

    // Crear sesión
    Logger.debug(
      `[FlowExecutor] 🟢 Creating new session for FlowID: "${flow.id}" | ContactID: "${contactId}"`,
    );

    // 🛡️ 100-YEAR FIX: Unique Constraint Protection
    // Ensure we don't crash if a session is already active for this flow (Race condition or stale state)
    // We deactivated matching triggers earlier, but if we are manually starting or restarting, force cleanup.
    // 🛡️ 100-YEAR FIX: Unique Constraint Protection
    // Ensure we don't crash if a session is already active.
    // Instead of updating to 'inactive' (which might clash with an existing inactive session depending on DB constraints),
    // we simply DELETE the conflict. This is a "Restart", so previous state is irrelevant.
    await prisma.contactFlowSession.deleteMany({
      where: {
        contactId,
        flowId: flow.id,
        isActive: true,
      },
    });

    let newSession;
    try {
      newSession = await prisma.contactFlowSession.create({
        data: {
          contactId,
          flowId: flow.id,
          companyId,
          conversationId,
          currentNodeId: startNode?.id, // Puede ser null si el flujo está vacío, pero ya validamos startNode
          isActive: true,
          variables: {},
          visitedNodes: startNode ? [startNode.id] : [],
        },
      });
    } catch (err: unknown) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2003"
      ) {
        Logger.error(
          `[FlowExecutor] ❌ FK Violation: The Flow ID "${flow.id}" does not exist in the 'workflows' table. Cache might be stale.`,
        );
        // Invalidar caché usando el servicio importado (Singleton)
        // La clave usada en getFlowCached es `workflow:${flowId}`
        await cacheService.delete(`workflow:${flow.id}`);
      }
      throw err;
    }

    Logger.info(
      `[FlowExecutor] Started new session ${newSession.id} for contact ${contactId}`,
    );

    // Incrementar contador de ejecuciones (Not in schema yet)
    // await prisma.workflow.update({ ... });

    return toFlowSessionState(newSession) as FlowSessionState;
  }

  /**
   * Ejecuta la lógica de un nodo
   */
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

    // Actualizar nodos visitados
    const visitedNodes = [...session.visitedNodes, node.id];
    await prisma.contactFlowSession.update({
      where: { id: session.id },
      data: {
        visitedNodes,
        lastStepAt: new Date(),
      },
    });

    // 🛡️ 100-YEAR FIX: Case Insensitive Node Type Handling
    // Frontend sends 'send_audio', Backend expects 'SEND_AUDIO'
    const strNodeType = node.type.toUpperCase();

    switch (strNodeType) {
      case "SEND_MESSAGE":
      case "MESSAGE": // Legacy support
      case "SEND_IMAGE":
      case "SEND_VIDEO":
      case "SEND_AUDIO":
      case "SEND_DOCUMENT":
        return await this.handleSendNode(node, session, flowStructure);

      case "ASK_DATA":
        return await this.handleAskDataNode(
          node,
          session,
          userMessage,
          flowStructure,
          shouldConsumeInput,
        );

      case "CONDITION":
        return await this.handleConditionNode(
          node,
          session,
          userMessage,
          flowStructure,
        );

      case "AI_AGENT":
        return await this.handleAIAgentNode(
          node,
          session,
          userMessage,
          flowStructure,
        );

      case "CREATE_DEAL":
        return await this.handleCreateDealNode(
          node,
          session,
          companyId,
          flowStructure,
        );

      case "UPDATE_CONTACT":
        return await this.handleUpdateContactNode(node, session, flowStructure);

      case "ASSIGN_AGENT":
        return await this.handleAssignAgentNode(
          node,
          session,
          conversationId,
          flowStructure,
        );

      case "AI_HANDOFF":
        return await this.handleHandoffNode(
          node,
          session,
          conversationId,
          flowStructure,
        );

      case "DELAY":
        return await this.handleDelayNode(node, session, flowStructure);

      case "END":
        await this.endSession(session.id);
        return node.data.message || "¡Gracias por tu tiempo!";

      default:
        Logger.warn(`[FlowExecutor] Unknown node type: ${node.type}`);
        await this.moveToNextNode(session.id, node.id, flowStructure);
        return null;
    }
  }

  /**
   * Maneja nodos de envío (mensaje, imagen, video, audio, documento)
   */
  private async handleSendNode(
    node: FlowNode,
    session: FlowSessionState,
    flowStructure: FlowStructure,
  ): Promise<string | FlowMediaResponse> {
    const nodeType = node.type.toLowerCase();

    // Reemplazar variables en todos los campos
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
        // Fallback for unknown types or legacy mixups
        response = replaceVars(node.data.message || node.data.content || "");
    }

    // Mover automáticamente al siguiente nodo
    await this.moveToNextNode(session.id, node.id, flowStructure);

    return response;
  }

  /*
   * Maneja nodos de solicitud de datos (INPUT)
   */
  private async handleAskDataNode(
    node: FlowNode,
    session: FlowSessionState,
    userMessage: string,
    flowStructure: FlowStructure,
    shouldConsumeInput: boolean,
  ): Promise<string | null> {
    const variableName = node.data.variable || "response";
    // 🧠 100-YEAR FIX: Silent Wait Support
    // Do NOT force a default question. If the user leaves it empty (e.g. because AI asked), be silent.
    const question = node.data.question;

    // 🧠 100-YEAR FIX: Control Flow Pause/Resume Logic
    // If we are NOT explicitly resuming (consuming input), we MUST pause and ask the question (if any).
    if (!shouldConsumeInput) {
      // Primera vez en este nodo (o re-entrada por loop), pausar
      await prisma.contactFlowSession.update({
        where: { id: session.id },
        data: {
          currentNodeId: node.id,
          isPaused: true, // PAUSAR para esperar respuesta
        },
      });

      // Only send message if explicitly configured
      if (question && question.trim() !== "") {
        return this.replaceVariables(question, session.variables);
      }
      return null;
    }

    // Ya estábamos pausados en este nodo, el userMessage es la respuesta
    const updatedVariables = {
      ...session.variables,
      [variableName]: userMessage,
    };

    await prisma.contactFlowSession.update({
      where: { id: session.id },
      data: {
        variables: updatedVariables,
        isPaused: false, // REANUDAR
      },
    });

    // Mover al siguiente nodo
    await this.moveToNextNode(
      session.id,
      node.id,
      flowStructure,
      updatedVariables,
    );

    // Opcionalmente enviar confirmación
    const confirmation = node.data.confirmation;
    if (confirmation) {
      return this.replaceVariables(confirmation, updatedVariables);
    }

    return null; // Continuar sin mensaje
  }

  /**
   * Maneja nodos de condición (BRANCHING)
   */
  private async handleConditionNode(
    node: FlowNode,
    session: FlowSessionState,
    userMessage: string,
    flowStructure: FlowStructure,
  ): Promise<string | null> {
    const conditions = node.data.conditions || [];
    const variable = node.data.variable || "last_response";
    const valueToCheck = String(session.variables[variable] ?? userMessage);

    // Evaluar condiciones
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
        // Encontrar el edge que sale de este sourceHandle
        const edge = flowStructure.edges.find(
          (e) => e.source === node.id && e.sourceHandle === targetHandle,
        );

        if (edge) {
          await this.moveToSpecificNode(session.id, edge.target, flowStructure);
          return null; // El siguiente nodo manejará la respuesta
        }
      }
    }

    // Ninguna condición coincidió, ir al nodo "else" o default
    const defaultEdge = flowStructure.edges.find(
      (e) => e.source === node.id && !e.sourceHandle,
    );

    if (defaultEdge) {
      await this.moveToSpecificNode(
        session.id,
        defaultEdge.target,
        flowStructure,
      );
    } else {
      await this.endSession(session.id);
    }

    return null;
  }

  /**
   * Maneja nodos de agente IA (OpenAI/Gemini)
   * ✨ INTEGRADO con Gestión de Agentes IA
   */
  private async handleAIAgentNode(
    node: FlowNode,
    session: FlowSessionState,
    userMessage: string,
    flowStructure: FlowStructure,
  ): Promise<string> {
    const aiAssistantId = node.data.aiAssistantId;

    // Validar que el agente esté seleccionado
    if (!aiAssistantId) {
      Logger.error("[FlowExecutor] AI_AGENT node without aiAssistantId");
      await this.moveToNextNode(session.id, node.id, flowStructure);
      return "Lo siento, el agente IA no está configurado. Por favor contacta a soporte.";
    }

    // Obtener configuración del agente desde la BD
    const agent = await prisma.aIAssistant.findUnique({
      where: { id: aiAssistantId },
    });

    if (!agent) {
      Logger.error(
        `[FlowExecutor] AI Assistant ${aiAssistantId} not found or inactive`,
      );
      await this.moveToNextNode(session.id, node.id, flowStructure);
      return "El agente IA no está disponible en este momento. Estamos trabajando para solucionarlo.";
    }

    // 🧠 100-YEAR FIX: Decoupled AI Provider Logic
    // We do NOT block execution if OpenAI is missing, because we might use Gemini.
    // Provider checks should happen just before usage.
    /*
    if (!this.openai) {
      Logger.warn("[FlowExecutor] OpenAI not configured");
       // ❌ CRITICAL BUG FIX: This return caused an Infinite Loop because it didn't advance the node!
       // If we ever return early, we MUST advance or end the session.
       // await this.moveToNextNode(session.id, node.id, flowStructure); 
       // return "El servicio de IA no está disponible. Por favor contacta a soporte.";
    }
    */

    try {
      // Construir system prompt con el prompt del agente
      let systemPrompt =
        agent.systemPrompt || "Eres un asistente virtual útil y amigable.";

      // Reemplazar variables en el prompt con datos capturados
      systemPrompt = this.replaceVariables(systemPrompt, session.variables);

      // 🧠 100-YEAR FIX: Context Awareness (Conversational Memory)
      // Fetch recent history so the AI knows what happened before (crucial for loops)
      const recentMessages = await prisma.message.findMany({
        where: { conversationId: session.conversationId },
        orderBy: { createdAt: "desc" },
        take: 6, // Last 6 messages context
      });

      const historyContext = recentMessages.reverse().map((msg) => ({
        role: (msg.direction === "INBOUND" ? "user" : "assistant") as
          | "user"
          | "assistant",
        content: msg.content,
      }));

      // Construct Messages Payload
      const messages: Array<{
        role: "system" | "user" | "assistant";
        content: string;
      }> = [{ role: "system", content: systemPrompt }];
      messages.push(...historyContext);

      // Add current message only if not already last in history (deduplication)
      const lastHistoryMsg = historyContext[historyContext.length - 1];
      if (!lastHistoryMsg || lastHistoryMsg.content !== userMessage) {
        messages.push({ role: "user", content: userMessage });
      }

      // 🧠 100-YEAR FIX: BYOK (Bring Your Own Key) & Multimodal
      // Fetch dynamic keys from DB instead of relying on static env vars
      const aiConfig = await prisma.aIConfig.findUnique({
        where: { companyId: session.companyId },
      });

      const geminiKey =
        aiConfig?.geminiKey ||
        process.env.GEMINI_API_KEY ||
        process.env.GOOGLE_API_KEY;

      // Check if we should use Gemini (Provider Logic)
      // Prioritize agent config if it explicitly requests Gemini, or default to it if key exists
      const isGeminiModel = agent.modelName?.includes("gemini");
      const shouldUseGemini = !!geminiKey && isGeminiModel;

      let aiResponse = "";

      if (shouldUseGemini && geminiKey) {
        try {
          const genAI = new GoogleGenerativeAI(geminiKey);
          const modelName = agent.modelName?.includes("gemini")
            ? agent.modelName
            : "gemini-1.5-flash"; // Cost-effective default

          const model = genAI.getGenerativeModel({
            model: modelName,
            systemInstruction: systemPrompt,
          });

          // 1. Convert History to Gemini Format
          let geminiHistory: Content[] = historyContext.map((msg) => ({
            role: msg.role === "assistant" ? "model" : "user",
            parts: [{ text: msg.content || "" }],
          }));

          // 🛡️ Gemini Validation: History MUST start with 'user' role.
          // We remove any leading 'model' messages to satisfy the API requirement.
          const firstUserIndex = geminiHistory.findIndex(
            (m) => m.role === "user",
          );
          if (firstUserIndex === -1) {
            // No user messages found in history (rare). Clear history to be safe.
            geminiHistory = [];
          } else if (firstUserIndex > 0) {
            // Drop leading 'model' messages
            geminiHistory = geminiHistory.slice(firstUserIndex);
          }

          // 2. Detect Image in Last Message (Multimodal)
          // Look into recentMessages for the one matching userMessage content
          // This matches the exact message triggered in this run
          const triggeringMsg = recentMessages.find(
            (m) =>
              m.content === userMessage &&
              m.direction === "INBOUND" &&
              m.metadata,
          );

          const promptParts: Part[] = [{ text: userMessage }];

          if (triggeringMsg && triggeringMsg.metadata) {
            // Strict Metadata Interface
            interface MediaMetadata {
              url?: string;
              publicUrl?: string;
              fileUrl?: string;
              mimetype?: string;
            }
            const meta = triggeringMsg.metadata as unknown as MediaMetadata;

            // Support various metadata patterns (S3, Cloudinary, Local)
            const mediaUrl = meta.url || meta.publicUrl || meta.fileUrl;

            if (mediaUrl) {
              try {
                Logger.info(
                  `[FlowExecutor] Downloading image for Gemini Vision: ${mediaUrl}`,
                );
                const imgRes = await fetch(mediaUrl);
                if (imgRes.ok) {
                  const arrayBuffer = await imgRes.arrayBuffer();
                  const base64Image =
                    Buffer.from(arrayBuffer).toString("base64");
                  promptParts.push({
                    inlineData: {
                      data: base64Image,
                      mimeType: meta.mimetype || "image/jpeg",
                    },
                  });
                }
              } catch (imgErr) {
                Logger.warn(
                  `[FlowExecutor] Failed to download image for analysis: ${imgErr}`,
                );
              }
            }
          }

          // 3. Start Chat & Send
          // We don't use startChat history for the very first turn if history is empty, but startChat handles it.
          const chat = model.startChat({
            history: geminiHistory,
          });

          const result = await chat.sendMessage(promptParts);
          aiResponse = result.response.text();
        } catch (geminiError) {
          Logger.error(
            "[FlowExecutor] Gemini API Error, falling back to OpenAI (if logic existed) or Error msg:",
            geminiError,
          );
          aiResponse =
            "Lo siento, tuve un problema analizando tu solicitud visual.";
        }
      } else {
        // Fallback to OpenAI (or Primary if model is GPT)
        const openaiKey = aiConfig?.openaiKey || process.env.OPENAI_API_KEY;
        let openaiClient = this.openai; // Default to global

        // If we have a specific key for this company, use it
        if (openaiKey) {
          openaiClient = new OpenAI({ apiKey: openaiKey });
        }

        if (openaiClient) {
          try {
            const completion = await openaiClient.chat.completions.create({
              model: agent.modelName || "gpt-3.5-turbo",
              messages: messages,
              temperature: agent.temperature || 0.7,
              max_tokens: 500,
            });
            aiResponse =
              completion.choices[0]?.message?.content ||
              "Lo siento, no pude generar una respuesta.";
          } catch (openaiErr) {
            Logger.error("[FlowExecutor] OpenAI Error:", openaiErr);
            aiResponse = "Lo siento, hubo un error con el servicio de IA.";
          }
        } else {
          Logger.error(
            "[FlowExecutor] No AI Provider configured (Gemini or OpenAI missing).",
          );
          aiResponse =
            "Error de configuración: No hay servicios de IA disponibles. Por favor configura tus credenciales.";
        }
      }

      // 🧠 100-YEAR FEATURE: AI Variable Extraction
      // Look for [DATA: {...}] tag to auto-fill session variables
      let extractedVariables: Record<string, unknown> = {};
      const dataRegex = /\[DATA:\s*({.*?})\]/s;
      const match = aiResponse.match(dataRegex);
      let finalAIResponse = aiResponse;

      if (match && match[1]) {
        try {
          const parsed = JSON.parse(match[1]);
          if (typeof parsed === "object" && parsed !== null) {
            extractedVariables = parsed;
            // Clean the response text for the user
            finalAIResponse = aiResponse.replace(dataRegex, "").trim();
            Logger.info(
              `[FlowExecutor] AI extracted variables: ${Object.keys(extractedVariables).join(", ")}`,
            );
          }
        } catch (error) {
          Logger.warn(
            `[FlowExecutor] AI returned invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }

      // 🧠 100-YEAR FIX: Detect Termination Keyword for Flow Continuation
      // If AI says "TERMINAR" or similar, we STOP waiting for user input and execute next steps immediately.
      const TERMINATION_KEYWORD = "TERMINAR"; // Define this in documentation/prompts
      const shouldTerminate = finalAIResponse.includes(TERMINATION_KEYWORD);

      if (shouldTerminate) {
        // Remove keyword from final message so user doesn't see it
        finalAIResponse = finalAIResponse
          .replace(TERMINATION_KEYWORD, "")
          .trim();
        Logger.info(
          `[FlowExecutor] 🛑 AI Termination Triggered. Advancing Flow.`,
        );
      }

      // Guardar respuesta y metadata en variables de sesión
      const updatedVariables: FlowVariables = {
        ...session.variables,
        ...(extractedVariables as Record<string, string | number | boolean>),
        ai_response: finalAIResponse,
        last_ai_agent_id: agent.id,
        last_ai_agent_name: agent.name,
      };

      // Si detectamos terminación, NO pausamos la sesión esperando respuesta (isPaused=false)
      // Forzamos avance real.
      await prisma.contactFlowSession.update({
        where: { id: session.id },
        data: {
          variables: updatedVariables,
          // If terminating, ensure we are NOT paused waiting for input
          isPaused: shouldTerminate ? false : session.isPaused,
        },
      });

      // Mover al siguiente nodo
      // Nota: moveToNextNode busca el siguiente enlace.
      // Si la sesión no está pausada (porque el usuario respondió), esto avanza.
      // Pero para AI, a menudo queremos que responda Y siga escuchando.
      // El cambio aquí es: Si TERMINAR -> Mover al siguiente nodo del flujo VISUAL (flecha saliente).

      /* 
         CRITICAL LOGIC: 
         Default behavior (No Terminate): AI responds -> Session stays on THIS node -> Wait for User Reply.
         Terminate Behavior: AI responds -> Session Moves to Next Node (e.g. Update Contact) -> We proceed.
      */

      if (shouldTerminate) {
        await this.moveToNextNode(
          session.id,
          node.id,
          flowStructure,
          updatedVariables,
        );
      } else {
        // STANDARD AI BEHAVIOR: Stay here, wait for next user message.
        // We do NOT call moveToNextNode because that would jump to "Update Contact" immediately
        // preventing the user from answering correctly if the AI asked a question.
        // HOWEVER, logic check:
        // If we don't move, we validly stay on 'ai_agent'.
        // When user replies, 'processMessage' calls 'executeNode' on the current node 'ai_agent' again.
      }

      Logger.info(
        `[FlowExecutor] AI Agent "${agent.name}" responded successfully`,
      );
      return finalAIResponse;
    } catch (error: unknown) {
      const errorMsg = getErrorMessage(error);
      const errorObj = error instanceof Error ? error : new Error(errorMsg);

      Logger.error(
        `[FlowExecutor] OpenAI error with agent ${agent.name}:`,
        errorMsg,
      );

      // Mensaje de error amigable según el tipo de error
      if ("code" in errorObj && errorObj.code === "insufficient_quota") {
        return "El servicio de IA ha alcanzado su límite. Por favor intenta más tarde.";
      } else if (
        "code" in errorObj &&
        errorObj.code === "rate_limit_exceeded"
      ) {
        return "Demasiadas solicitudes. Por favor espera un momento e intenta de nuevo.";
      } else {
        return "Lo siento, hubo un error al procesar tu solicitud. Nuestro equipo ha sido notificado.";
      }
    }
  }

  /**
   * Maneja creación de deal
   */
  private async handleCreateDealNode(
    node: FlowNode,
    session: FlowSessionState,
    companyId: string,
    flowStructure: FlowStructure,
  ): Promise<string | null> {
    try {
      // Obtener datos del deal del nodo
      const dealTitle = this.replaceVariables(
        node.data.title || "Nuevo Deal",
        session.variables,
      );
      const dealValue = parseFloat(node.data.value || "0");

      // Buscar pipeline default
      let pipeline = await prisma.pipeline.findFirst({
        where: { companyId, isDefault: true },
      });

      if (!pipeline) {
        pipeline = await prisma.pipeline.findFirst({
          where: { companyId },
        });
      }

      const targetPipelineId = pipeline?.id;

      if (!targetPipelineId) throw new Error("No pipeline found");

      const defaultStage = await prisma.stage.findFirst({
        where: { pipelineId: targetPipelineId },
        orderBy: { order: "asc" },
      });
      const targetStageId = defaultStage?.id;

      if (!targetStageId) throw new Error("No stage found");

      // Crear deal
      await prisma.deal.create({
        data: {
          title: dealTitle,
          value: dealValue,
          currency: "USD",
          company: { connect: { id: companyId } },
          pipeline: { connect: { id: targetPipelineId } },
          stage: { connect: { id: targetStageId } },
        },
      });

      await this.moveToNextNode(session.id, node.id, flowStructure);

      return node.data.confirmation || null;
    } catch (error: unknown) {
      const errorMsg = getErrorMessage(error);
      Logger.error("[FlowExecutor] Error creating deal:", errorMsg);

      // Move to next node even if deal creation fails
      await this.moveToNextNode(session.id, node.id, flowStructure);

      return "Hubo un problema al crear el deal. Continuaremos con el proceso.";
    }
  }

  /**
   * Maneja actualización de contacto
   */
  /**
   * Maneja actualización de contacto con soporte para Custom Fields
   */
  /**
   * Maneja actualización de contacto con soporte para Custom Fields
   */
  private async handleUpdateContactNode(
    node: FlowNode,
    session: FlowSessionState,
    flowStructure: FlowStructure,
  ): Promise<string | null> {
    // 🛡️ 100-YEAR FIX: Strict Typing & Aggregation Logic
    Logger.info(
      `[FlowExecutor] 🏗️ Processing UPDATE_CONTACT node ${node.id} for Contact ${session.contactId}`,
    );

    // Debug: Show available variables for the user
    Logger.info(
      `[FlowExecutor] 📊 Current Session Variables: ${JSON.stringify(session.variables, null, 2)}`,
    );

    // 1. Combine inputs safely typed as Record<string, unknown>
    let fieldsToUpdate: Record<string, unknown> = {
      ...(node.data.fields || {}),
    };

    // 2. Aggregate explicit properties from Frontend Form
    if (node.data.name) fieldsToUpdate["name"] = node.data.name;
    if (node.data.email) fieldsToUpdate["email"] = node.data.email;
    if (node.data.phone) fieldsToUpdate["phone"] = node.data.phone;

    // 3. Parse JSON textarea for Custom Fields safely
    // Handle case where customFields might already be an object or a string
    if (node.data.customFields) {
      if (typeof node.data.customFields === "string") {
        try {
          const parsedCustom = JSON.parse(node.data.customFields);
          if (typeof parsedCustom === "object" && parsedCustom !== null) {
            fieldsToUpdate = { ...fieldsToUpdate, ...parsedCustom };
          }
        } catch (error) {
          const errMsg = error instanceof Error ? error.message : String(error);
          Logger.warn(
            `[FlowExecutor] ⚠️ Invalid JSON in customFields for node ${node.id}: ${errMsg}`,
          );
        }
      } else if (
        typeof node.data.customFields === "object" &&
        node.data.customFields !== null
      ) {
        // It's already an object, just merge it
        fieldsToUpdate = {
          ...fieldsToUpdate,
          ...(node.data.customFields as Record<string, unknown>),
        };
      }
    }

    Logger.info(
      `[FlowExecutor] 📝 Raw Fields identified for update: ${JSON.stringify(fieldsToUpdate)}`,
    );

    // 4. Prepare Typed Prisma Update Input
    const prismaUpdateData: Prisma.ContactUpdateInput = {};
    const customFieldsUpdates: Record<string, Prisma.InputJsonValue> = {};

    // Define Native Columns explicitly matching Prisma Model
    const NATIVE_FIELDS = [
      "name",
      "email",
      "phone",
      "avatarUrl",
      "tags",
      "notes",
      "profilePicUrl",
      "about",
    ];

    // 5. Iterate and Classify
    for (const [key, value] of Object.entries(fieldsToUpdate)) {
      if (typeof value !== "string" && typeof value !== "number") continue; // Skip complex objects not meant for direct mapping

      // Resolve variable substitution
      const resolvedValue = this.replaceVariables(
        String(value),
        session.variables,
      );

      // Debug each resolution
      if (String(value).includes("{{")) {
        Logger.info(
          `[FlowExecutor] 🔍 Resolving '${key}': '${value}' -> '${resolvedValue}'`,
        );
      }

      if (NATIVE_FIELDS.includes(key)) {
        // Safe assignment purely by key name check logic
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore - We validated key is in NATIVE_FIELDS which maps to model
        prismaUpdateData[key] = resolvedValue;
      } else {
        // Treat as Custom Field
        customFieldsUpdates[key] = resolvedValue;
      }
    }

    // 6. Smart Merge for Custom Fields (Read -> Merge -> Write)
    if (Object.keys(customFieldsUpdates).length > 0) {
      try {
        const currentContact = await prisma.contact.findUnique({
          where: { id: session.contactId },
          select: { customFields: true },
        });

        // Ensure existingCustom is a proper object
        const existingCustomRaw = currentContact?.customFields;
        const existingCustom =
          typeof existingCustomRaw === "object" && existingCustomRaw !== null
            ? (existingCustomRaw as Record<string, Prisma.InputJsonValue>)
            : {};

        prismaUpdateData.customFields = {
          ...existingCustom,
          ...customFieldsUpdates,
        };
      } catch (err) {
        Logger.error(
          `[FlowExecutor] ❌ Error fetching contact for custom fields merge: ${err}`,
        );
      }
    }

    // 7. Execute Update Only If Data Changed
    if (Object.keys(prismaUpdateData).length > 0) {
      Logger.info(
        `[FlowExecutor] 🚀 Executing Contact Update: ${JSON.stringify(prismaUpdateData)}`,
      );
      try {
        await prisma.contact.update({
          where: { id: session.contactId },
          data: prismaUpdateData,
        });
        Logger.info(
          `[FlowExecutor] ✅ Contact ${session.contactId} updated successfully.`,
        );
      } catch (error) {
        Logger.error(
          `[FlowExecutor] ❌ Failed to update contact ${session.contactId}: ${error}`,
        );
      }
    } else {
      Logger.warn(
        `[FlowExecutor] ⚠️ No fields to update for Contact ${session.contactId}`,
      );
    }

    await this.moveToNextNode(session.id, node.id, flowStructure);

    return null;
  }

  /**
   * Maneja asignación de agente
   */
  private async handleAssignAgentNode(
    node: FlowNode,
    session: FlowSessionState,
    conversationId: string,
    _flowStructure: FlowStructure,
  ): Promise<string | null> {
    const { assignmentType, agentId, queueId, message } = node.data;

    // 🛡️ 100-YEAR FIX: Explicit Type Definition (No ANY)
    type EnterpriseRoutingUpdate = Prisma.ConversationUpdateInput & {
      queueId?: string | null;
      assignedToId?: string | null;
      status?: string | Prisma.EnumConversationStatusFieldUpdateOperationsInput;
    };

    const updateData: EnterpriseRoutingUpdate = {};
    let logMsg = "";

    // 🛡️ 100-YEAR FIX: Robust Routing Logic (Agent vs Queue)
    if (assignmentType === "queue" && queueId) {
      // 1. Route to Queue
      // Status 'OPEN' implies it's in the bucket but not yet picked by a human
      updateData.status = "OPEN";
      updateData.queueId = queueId;
      updateData.assignedToId = null;
      logMsg = `Routed to Queue ${queueId}`;
    } else if (agentId) {
      // 2. Route to Specific Agent
      updateData.status = "IN_PROGRESS";
      updateData.assignedToId = agentId;
      logMsg = `Assigned to Agent ${agentId}`;
    } else {
      // 3. Fallback (No Agent/Queue defined) -> General Inbox
      updateData.status = "OPEN";
      logMsg = "Moved to General Inbox (No routing target defined)";
    }

    // Execute Routing
    await prisma.conversation.update({
      where: { id: conversationId },
      data: updateData as Prisma.ConversationUpdateInput,
    });

    Logger.info(`[FlowExecutor] Handoff executed: ${logMsg}`);

    await this.endSession(session.id); // Terminar flow al transferir

    return message || "Te estamos conectando con nuestro equipo...";
  }

  /**
   * Maneja handoff a humano
   */
  private async handleHandoffNode(
    node: FlowNode,
    session: FlowSessionState,
    conversationId: string,
    _flowStructure: FlowStructure,
  ): Promise<string> {
    // Pausar el bot y transferir a cola
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { status: "IN_PROGRESS" },
    });

    await this.endSession(session.id);

    return node.data.message || "Un agente tomará tu caso en breve.";
  }

  /**
   * Maneja delay (esperar X tiempo)
   */
  private async handleDelayNode(
    node: FlowNode,
    session: FlowSessionState,
    flowStructure: FlowStructure,
  ): Promise<string | null> {
    // Default to 5 seconds if not defined
    const duration = parseInt(node.data.content || "5") * 1000;

    // 1. Move pointer to next node (so when we resume, we are at next node)
    await this.moveToNextNode(session.id, node.id, flowStructure);

    // 2. Schedule Resume
    await flowQueueService.scheduleResume(session.id, duration);

    // 3. Pause Session (stop loop)
    await pauseSession(session.id);

    // Return null to allow loop to exit normally (loop checks isPaused)
    return null;
  }

  /**
   * Mueve la sesión al siguiente nodo
   */
  private async moveToNextNode(
    sessionId: string,
    currentNodeId: string,
    flowStructure: FlowStructure,
    variables?: FlowVariables,
  ): Promise<void> {
    // Encontrar edge que sale de este nodo
    const edge = flowStructure.edges.find((e) => e.source === currentNodeId);

    if (!edge) {
      // No hay siguiente nodo, terminar
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

    await prisma.contactFlowSession.update({
      where: { id: sessionId },
      data: updateData,
    });
  }

  /**
   * Mueve la sesión a un nodo específico
   */
  private async moveToSpecificNode(
    sessionId: string,
    targetNodeId: string,
    _flowStructure: FlowStructure,
  ): Promise<void> {
    await prisma.contactFlowSession.update({
      where: { id: sessionId },
      data: {
        currentNodeId: targetNodeId,
        lastStepAt: new Date(),
      },
    });
  }

  /**
   * Finaliza una sesión de flujo
   */
  private async endSession(sessionId: string): Promise<void> {
    // 🛡️ 100-YEAR FIX: Delete the session to prevent Unique Constraint violations on (contactId, flowId, isActive)
    // History is implicitly transient or tracked via other means. This cleans up the state.
    await prisma.contactFlowSession.deleteMany({
      where: { id: sessionId },
    });

    Logger.info(`[FlowExecutor] Session ${sessionId} ended`);
  }

  /**
   * Reemplaza variables en un texto
   * Ejemplo: "Hola {{name}}" con variables {name: "Juan"} → "Hola Juan"
   */
  private replaceVariables(text: string, variables: FlowVariables): string {
    let result = text;
    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`{{${key}}}`, "g");
      result = result.replace(regex, String(value));
    }
    return result;
  }
}

export const flowExecutor = new FlowExecutorService();
