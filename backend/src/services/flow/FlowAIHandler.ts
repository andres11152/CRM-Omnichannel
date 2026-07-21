/**
 * [AI] FLOW AI HANDLER
 *
 * AI Agent node execution logic:
 * - handleAIAgentNode: Orchestrates AI interaction (BYOK, history, variable extraction, termination)
 * - callGemini: Google Gemini API integration (multimodal support)
 * - callOpenAI: OpenAI API integration
 */

import { flowSessionRepository } from "@/repositories/FlowSessionRepository";
import { messageRepository } from "@/repositories/MessageRepository";
import { Logger } from "@/utils/logger";
import { getErrorMessage } from "@/utils/errorHelpers";
import { replaceVariables } from "./utils/FlowUtils";
import OpenAI from "openai";
import { GoogleGenerativeAI, Part, Content } from "@google/generative-ai";
import type {
  FlowSessionState,
  FlowVariables,
  FlowNode,
  FlowStructure,
} from "@/types/flow.types";

export class FlowAIHandler {
  private openai: OpenAI | null = null;

  constructor() {
    if (process.env.OPENAI_API_KEY) {
      this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    }
  }

  // ────────────────────────────────────────────────
  // AI AGENT NODE (OpenAI / Gemini)
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
    const aiAssistantId = node.data.aiAssistantId;

    if (!aiAssistantId) {
      Logger.error("[FlowExecutor] AI_AGENT node without aiAssistantId");
      await moveToNextNode(session.id, node.id, flowStructure);
      return "Lo siento, el agente de IA no está configurado. Contacta a soporte.";
    }

    const agent = await flowSessionRepository.findAIAssistant(aiAssistantId);

    if (!agent) {
      Logger.error(
        `[FlowExecutor] AI Assistant ${aiAssistantId} not found or inactive`,
      );
      await moveToNextNode(session.id, node.id, flowStructure);
      return "El agente de IA no está disponible en este momento. Estamos trabajando para resolverlo.";
    }

    // C6: Validate that the assistant belongs to the current company (multi-tenant isolation)
    if (agent.companyId !== session.companyId) {
      Logger.error(
        `[FlowExecutor] [SEC] AI Assistant ${aiAssistantId} belongs to company ${agent.companyId}, not ${session.companyId}. Access denied.`,
      );
      await moveToNextNode(session.id, node.id, flowStructure);
      return "El agente de IA no está disponible. Contacta a soporte.";
    }

    try {
      let systemPrompt =
        agent.systemPrompt || "You are a helpful and friendly virtual assistant.";
      // "Prompt Adicional" in the UI (AINodeProperties.tsx) — concatenated
      // onto the assistant's base prompt for this node specifically.
      const additionalPrompt = (node.data as Record<string, unknown>).additionalPrompt as string | undefined;
      if (additionalPrompt) {
        systemPrompt = `${systemPrompt}\n\n${additionalPrompt}`;
      }
      systemPrompt = replaceVariables(systemPrompt, session.variables);

      // Conversational Memory
      const recentMessages = await messageRepository.findMany({
        where: { conversationId: session.conversationId },
        orderBy: { createdAt: "desc" },
        take: 6,
      });

      const historyContext = recentMessages.reverse().map((msg) => ({
        role: (msg.direction === "INBOUND" ? "user" : "assistant") as
          | "user"
          | "assistant",
        content: msg.content,
      }));

      const messages: Array<{
        role: "system" | "user" | "assistant";
        content: string;
      }> = [{ role: "system", content: systemPrompt }];
      messages.push(...historyContext);

      const lastHistoryMsg = historyContext[historyContext.length - 1];
      if (!lastHistoryMsg || lastHistoryMsg.content !== userMessage) {
        messages.push({ role: "user", content: userMessage });
      }

      // BYOK (Bring Your Own Key)
      const aiConfig = await flowSessionRepository.findAIConfig(
        session.companyId,
      );

      const geminiKey =
        aiConfig?.geminiKey ||
        process.env.GEMINI_API_KEY ||
        process.env.GOOGLE_API_KEY;

      const isGeminiModel = agent.modelName?.includes("gemini");
      const shouldUseGemini = !!geminiKey && isGeminiModel;

      let aiResponse = "";

      if (shouldUseGemini && geminiKey) {
        aiResponse = await this.callGemini(
          geminiKey,
          agent,
          systemPrompt,
          historyContext,
          userMessage,
          recentMessages,
        );
      } else {
        aiResponse = await this.callOpenAI(
          aiConfig?.openaiKey,
          agent,
          messages,
        );
      }

      // AI Variable Extraction
      let extractedVariables: Record<string, unknown> = {};
      const dataRegex = /\[DATA:\s*({.*?})\]/s;
      const match = aiResponse.match(dataRegex);
      let finalAIResponse = aiResponse;

      if (match && match[1]) {
        try {
          const parsed = JSON.parse(match[1]);
          if (typeof parsed === "object" && parsed !== null) {
            extractedVariables = parsed;
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

      // Termination Keyword Detection
      const TERMINATION_KEYWORD = "TERMINAR";
      let shouldTerminate = finalAIResponse.includes(TERMINATION_KEYWORD);

      if (shouldTerminate) {
        finalAIResponse = finalAIResponse
          .replace(TERMINATION_KEYWORD, "")
          .trim();
        Logger.info(
          `[FlowExecutor]  AI Termination Triggered. Advancing Flow.`,
        );
      }

      // "Pausar flujo" checkbox in the UI (AINodeProperties.tsx). Only acts
      // when EXPLICITLY unchecked (=== false) so flows built before this
      // field existed — where it's simply undefined — keep looping/waiting
      // exactly as before. When explicitly off, this node is one-shot: reply
      // once and always advance, regardless of the TERMINAR keyword.
      const waitForUser = (node.data as Record<string, unknown>).waitForUser;
      if (waitForUser === false && !shouldTerminate) {
        shouldTerminate = true;
        Logger.info(
          `[FlowExecutor] AI node ${node.id} has "waitForUser" disabled — advancing after a single response.`,
        );
      }

      const updatedVariables: FlowVariables = {
        ...session.variables,
        ...(extractedVariables as Record<string, string | number | boolean>),
        ai_response: finalAIResponse,
        last_ai_agent_id: agent.id,
        last_ai_agent_name: agent.name,
      };

      await flowSessionRepository.updateSession(session.id, {
        variables: updatedVariables,
        isPaused: shouldTerminate ? false : true,
      });

      if (shouldTerminate) {
        await moveToNextNode(
          session.id,
          node.id,
          flowStructure,
          updatedVariables,
        );
      }

      Logger.info(
        `[FlowExecutor] AI Agent "${agent.name}" responded successfully`,
      );
      return finalAIResponse;
    } catch (error: unknown) {
      const errorMsg = getErrorMessage(error);
      const errorObj = error instanceof Error ? error : new Error(errorMsg);

      Logger.error(
        `[FlowExecutor] OpenAI/Gemini error with agent ${agent.name}:`,
        errorMsg,
      );

      // [SEC] Anti-trap mechanism: delete active flow session so user isn't stuck receiving errors
      try {
        await flowSessionRepository.deleteSession(session.id);
        Logger.info(`[FlowExecutor] Active session ${session.id} deleted successfully to untrap contact.`);
      } catch (dbErr) {
        Logger.error(`[FlowExecutor] Failed to auto-delete session ${session.id}:`, dbErr);
      }

      if ("code" in errorObj && errorObj.code === "insufficient_quota") {
        return "Lo siento, el servicio de IA ha alcanzado su límite de cuota. Un agente se comunicará pronto.";
      } else if (
        "code" in errorObj &&
        errorObj.code === "rate_limit_exceeded"
      ) {
        return "Demasiadas solicitudes. Por favor, espera un momento o espera a que un agente te atienda.";
      } else {
        return "Lo siento, estamos experimentando dificultades técnicas. Un agente se comunicará contigo pronto.";
      }
    }
  }

  // ────────────────────────────────────────────────
  // GEMINI PROVIDER
  // ────────────────────────────────────────────────

  private async callGemini(
    geminiKey: string,
    agent: { modelName?: string | null; systemPrompt?: string | null },
    systemPrompt: string,
    historyContext: Array<{ role: "user" | "assistant"; content: string }>,
    userMessage: string,
    recentMessages: Array<{
      content: string;
      direction: string;
      metadata: unknown;
    }>,
  ): Promise<string> {
    try {
      const genAI = new GoogleGenerativeAI(geminiKey);
      const modelName = agent.modelName?.includes("gemini")
        ? agent.modelName
        : "gemini-2.5-flash";

      const model = genAI.getGenerativeModel({
        model: modelName,
        systemInstruction: systemPrompt,
      });

      let geminiHistory: Content[] = historyContext.map((msg) => ({
        role: msg.role === "assistant" ? "model" : "user",
        parts: [{ text: msg.content || "" }],
      }));

      const firstUserIndex = geminiHistory.findIndex((m) => m.role === "user");
      if (firstUserIndex === -1) {
        geminiHistory = [];
      } else if (firstUserIndex > 0) {
        geminiHistory = geminiHistory.slice(firstUserIndex);
      }

      // Multimodal Image Detection
      const triggeringMsg = recentMessages.find(
        (m) =>
          m.content === userMessage && m.direction === "INBOUND" && m.metadata,
      );

      const promptParts: Part[] = [{ text: userMessage }];

      if (triggeringMsg && triggeringMsg.metadata) {
        interface MediaMetadata {
          url?: string;
          publicUrl?: string;
          fileUrl?: string;
          mimetype?: string;
        }
        const meta = triggeringMsg.metadata as unknown as MediaMetadata;
        const mediaUrl = meta.url || meta.publicUrl || meta.fileUrl;

        if (mediaUrl) {
          try {
            Logger.info(
              `[FlowExecutor] Downloading image for Gemini Vision: ${mediaUrl}`,
            );
            const imgRes = await fetch(mediaUrl);
            if (imgRes.ok) {
              const arrayBuffer = await imgRes.arrayBuffer();
              const base64Image = Buffer.from(arrayBuffer).toString("base64");
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

      const chat = model.startChat({ history: geminiHistory });
      const result = await chat.sendMessage(promptParts);
      return result.response.text();
    } catch (geminiError) {
      Logger.error("[FlowExecutor] Gemini API Error:", geminiError);
      throw geminiError;
    }
  }

  // ────────────────────────────────────────────────
  // OPENAI PROVIDER
  // ────────────────────────────────────────────────

  private async callOpenAI(
    openaiKey: string | undefined | null,
    agent: { modelName?: string | null; temperature?: number | null; maxTokens?: number | null },
    messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
  ): Promise<string> {
    let openaiClient = this.openai;

    if (openaiKey) {
      openaiClient = new OpenAI({ apiKey: openaiKey });
    }

    if (openaiClient) {
      try {
        const completion = await openaiClient.chat.completions.create({
          model: agent.modelName || "gpt-3.5-turbo",
          messages: messages,
          temperature: agent.temperature || 0.7,
          max_tokens: agent.maxTokens || 1000,
        });
        return (
          completion.choices[0]?.message?.content ||
          "Lo siento, no pude generar una respuesta en este momento."
        );
      } catch (openaiErr) {
        Logger.error("[FlowExecutor] OpenAI Error:", openaiErr);
        throw openaiErr;
      }
    }

    throw new Error("No hay credenciales de OpenAI configuradas.");
  }

}
