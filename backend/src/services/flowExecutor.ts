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
import { Logger } from "../utils/logger";
import OpenAI from "openai";
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
} from "../interfaces/FlowSession";
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

      // Si no hay sesión, chequear triggers (palabras clave)
      if (!session) {
        session = await this.checkTriggers(
          contactId,
          message,
          companyId,
          conversationId,
        );
        // Si no hay trigger, retornamos array vacío (no flow executed)
        if (!session) return [];
      }

      // PASO 2: Ejecución en Loop (Extracted for reusability)
      return await this.runFlowLoop(
        session,
        message,
        companyId,
        conversationId,
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
  ): Promise<FlowExecutionResult[]> {
    const results: FlowExecutionResult[] = [];
    const MAX_LOOPS = 20;
    let loopCount = 0;
    let session = initialSession;

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

      const flowStructure = flow.nodes as unknown as FlowStructure;

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

      // Ejecutar nodo con Timeout Protection
      const result = await this.executeNodeWithTimeout(
        currentNode,
        session,
        message,
        flowStructure,
        companyId,
        conversationId,
      );

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
      const triggerData =
        flow.triggerConfig as unknown as KeywordTriggerData | null;
      const keywords = triggerData?.keywords || [];

      // Verificar si alguna keyword coincide
      for (const keyword of keywords) {
        if (messageLower.includes(keyword.toLowerCase())) {
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

    const flowStructure = flow.nodes as unknown as FlowStructure;
    const startNode = flowStructure.nodes.find((n) => n.type === "START");

    if (!startNode) {
      throw new Error("No START node found in flow");
    }

    // Crear sesión
    const newSession = await prisma.contactFlowSession.create({
      data: {
        contactId,
        flowId,
        companyId,
        conversationId,
        currentNodeId: startNode.id,
        isActive: true,
        variables: {},
        visitedNodes: [startNode.id],
      },
    });

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

    switch (node.type) {
      case "SEND_MESSAGE":
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
    const nodeType = node.type;

    // Reemplazar variables en todos los campos
    const replaceVars = (text: string) =>
      this.replaceVariables(text, session.variables);

    let response: string | FlowMediaResponse;

    switch (nodeType) {
      case "SEND_MESSAGE":
        response = replaceVars(
          node.data.message || node.data.content || node.data.text || "",
        );
        break;

      case "SEND_IMAGE":
        response = {
          type: "image",
          url: replaceVars(node.data.mediaUrl || node.data.imageUrl || ""),
          message: node.data.message
            ? replaceVars(node.data.message)
            : undefined,
        };
        break;

      case "SEND_VIDEO":
        response = {
          type: "video",
          url: replaceVars(node.data.mediaUrl || node.data.videoUrl || ""),
          message: node.data.message
            ? replaceVars(node.data.message)
            : undefined,
        };
        break;

      case "SEND_AUDIO":
        response = {
          type: "audio",
          url: replaceVars(node.data.mediaUrl || node.data.audioUrl || ""),
        };
        break;

      case "SEND_DOCUMENT":
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

    // Mover automáticamente al siguiente nodo
    await this.moveToNextNode(session.id, node.id, flowStructure);

    return response;
  }

  /**
   * Maneja nodos de solicitud de datos (INPUT)
   */
  private async handleAskDataNode(
    node: FlowNode,
    session: FlowSessionState,
    userMessage: string,
    flowStructure: FlowStructure,
  ): Promise<string> {
    const variableName = node.data.variable || "response";
    const question =
      node.data.question || "¿Puedes proporcionar esta información?";

    // Si session está en este nodo por primera vez, enviar la pregunta
    if (session.currentNodeId !== node.id) {
      // Primera vez en este nodo, enviar pregunta y pausar
      await prisma.contactFlowSession.update({
        where: { id: session.id },
        data: {
          currentNodeId: node.id,
          isPaused: true, // PAUSAR para esperar respuesta
        },
      });

      return this.replaceVariables(question, session.variables);
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

    return null as unknown as string; // Continuar sin mensaje
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

    if (!this.openai) {
      Logger.warn("[FlowExecutor] OpenAI not configured");
      return "El servicio de IA no está disponible. Por favor contacta a soporte.";
    }

    try {
      // Construir system prompt con el prompt del agente
      let systemPrompt =
        agent.systemPrompt || "Eres un asistente virtual útil y amigable.";

      // Reemplazar variables en el prompt con datos capturados
      systemPrompt = this.replaceVariables(systemPrompt, session.variables);

      // Llamar a OpenAI con configuración del agente
      const completion = await this.openai.chat.completions.create({
        model: agent.modelName || "gpt-3.5-turbo",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        temperature: agent.temperature || 0.7,
        max_tokens: 500,
      });

      const aiResponse =
        completion.choices[0]?.message?.content ||
        "Lo siento, no pude generar una respuesta.";

      // Guardar respuesta y metadata en variables de sesión
      const updatedVariables = {
        ...session.variables,
        ai_response: aiResponse,
        last_ai_agent_id: agent.id,
        last_ai_agent_name: agent.name,
      };

      await prisma.contactFlowSession.update({
        where: { id: session.id },
        data: { variables: updatedVariables },
      });

      // Mover al siguiente nodo
      await this.moveToNextNode(
        session.id,
        node.id,
        flowStructure,
        updatedVariables,
      );

      Logger.info(
        `[FlowExecutor] AI Agent "${agent.name}" responded successfully`,
      );
      return aiResponse;
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
  private async handleUpdateContactNode(
    node: FlowNode,
    session: FlowSessionState,
    flowStructure: FlowStructure,
  ): Promise<string | null> {
    const fieldsToUpdate = node.data.fields || {};
    const updateData: Record<string, string> = {};

    // Reemplazar variables en los valores
    for (const [key, value] of Object.entries(fieldsToUpdate)) {
      updateData[key] = this.replaceVariables(
        value as string,
        session.variables,
      );
    }

    await prisma.contact.update({
      where: { id: session.contactId },
      data: updateData,
    });

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
    const agentId = node.data.agentId;

    if (agentId) {
      await prisma.conversation.update({
        where: { id: conversationId },
        data: {
          assignedToId: agentId,
          status: "IN_PROGRESS",
        },
      });
    }

    await this.endSession(session.id); // Terminar flow al transferir

    return node.data.message || "Te estoy conectando con un agente humano...";
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
    await prisma.contactFlowSession.update({
      where: { id: sessionId },
      data: {
        isActive: false,
        currentNodeId: null,
        completedAt: new Date(),
      },
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
