import { EventEmitter } from "events";
import { Prisma } from "@prisma/client";
import { Logger } from "@/utils/logger";
import { emailService } from "./email/emailService";
import { companySettingsService } from "./CompanySettingsService";
import { workflowRepository } from "@/repositories/WorkflowRepository";
import { workflowExecutionRepository } from "@/repositories/WorkflowExecutionRepository";
import { userRepository } from "@/repositories/UserRepository";
import { dealRepository } from "@/repositories/DealRepository";
import { contactRepository } from "@/repositories/ContactRepository";
import { activityRepository } from "@/repositories/ActivityRepository";
import {
  DealPayload,
  WorkflowNode,
  WorkflowDefinition,
  WorkflowActionHandler,
} from "../types/workflow.types";
import { resolveVariables } from "@/utils/variableResolver";
import { flowSessionRepository } from "@/repositories/FlowSessionRepository";
import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";

/**
 * ️ WORKFLOW ENGINE (Audit Hardened)
 * 
 * Orchestrates event-based automations with multi-tenant isolation.
 */

// ==========================================
// ️ WORKFLOW ACTION HANDLERS
// ==========================================

class EmailActionHandler implements WorkflowActionHandler {
  async execute(
    node: WorkflowNode,
    payload: DealPayload,
    companyId: string,
    systemUserId: string,
  ): Promise<void> {
    const recipientOption = node.data?.options?.[0];
    
    //  RESOLVE VARIABLES
    const context: Record<string, unknown> = { ...payload };
    const subject = resolveVariables(
      node.data?.options?.[1] || node.data?.params?.subject || "Sin Asunto",
      context
    );
    const bodyText = resolveVariables(
      node.data?.content || node.data?.params?.body || "",
      context
    );

    let targetEmail = "";
    let targetContactId: string | undefined = undefined;

    if (recipientOption === "Cliente" || !recipientOption) {
      const deal = await dealRepository.findById(payload.dealId, companyId);
      if (deal?.contact?.email) {
        targetEmail = deal.contact.email;
        targetContactId = deal.contact.id;
        context.contact = deal.contact;
      } else {
        Logger.warn(`[WorkflowAction:Email] No contact info for Deal ${payload.dealId}`);
        return;
      }
    } else if (recipientOption.includes("@")) {
      targetEmail = recipientOption;
      const contact = await contactRepository.findFirst({
        where: { email: targetEmail, companyId },
      });
      if (contact) targetContactId = contact.id;
    }

    if (targetEmail) {
      Logger.info(`[WorkflowAction:Email] Sending to ${targetEmail}`);

      // [SEC] Resolve dynamic, tenant-specific sender to comply with strict SPF/DKIM SMTP policies
      const senderConfig = await companySettingsService.getSenderConfig(companyId).catch(() => null);
      const fromEmail = senderConfig?.fromEmail || process.env.DEFAULT_SENDER_EMAIL || `no-reply@sentry.software`;
      const fromName = senderConfig?.fromName || "Automation Software";
      const formattedFrom = `"${fromName}" <${fromEmail}>`;

      await emailService.sendEmail({
        companyId,
        to: [targetEmail],
        subject,
        bodyHtml: bodyText.replace(/\n/g, "<br>"),
        bodyText,
        contactId: targetContactId,
        from: formattedFrom,
      });

      await activityRepository.create({
        data: {
          companyId,
          type: "EMAIL",
          subject: ` Email Automático: ${subject}`,
          description: `Destinatario: ${targetEmail}\n\n${bodyText}`,
          dealId: payload.dealId,
          status: "COMPLETED",
          createdById: systemUserId,
        },
      });
    }
  }
}

class TaskActionHandler implements WorkflowActionHandler {
  async execute(
    node: WorkflowNode,
    payload: DealPayload,
    companyId: string,
    systemUserId: string,
  ): Promise<void> {
    const subject = resolveVariables(node.data?.label || "Tarea Automática de Workflow", payload as unknown as Record<string, unknown>);
    const description = resolveVariables(node.data?.content || `Generada para el deal ${payload.dealId}`, payload as unknown as Record<string, unknown>);

    Logger.info(`[WorkflowAction:Task] Creating for Deal ${payload.dealId}`);
    await activityRepository.create({
      data: {
        companyId,
        type: "TASK",
        subject,
        description,
        dealId: payload.dealId,
        status: "PENDING",
        createdById: systemUserId,
      },
    });
  }
}

class AIActionHandler implements WorkflowActionHandler {
  async execute(
    node: WorkflowNode,
    payload: DealPayload,
    companyId: string,
  ): Promise<void> {
    const aiAssistantId = node.data?.aiAssistantId || node.data?.params?.assistantId;
    if (!aiAssistantId) throw new Error("AI Agent node missing AssistantId");

    const [agent, aiConfig] = await Promise.all([
      flowSessionRepository.findAIAssistant(aiAssistantId),
      flowSessionRepository.findAIConfig(companyId)
    ]);

    if (!agent) throw new Error(`AI Assistant ${aiAssistantId} not found`);

    const context = payload as unknown as Record<string, unknown>;
    const systemPrompt = resolveVariables(agent.systemPrompt || "", context);
    const userPrompt = resolveVariables(node.data?.content || "Analiza el contexto y responde.", context);

    let aiResponse = "";

    if (agent.modelProvider === "GEMINI") {
      const key = aiConfig?.geminiKey || process.env.GEMINI_API_KEY;
      if (!key) throw new Error("Gemini API Key missing for tenant");
      
      const genAI = new GoogleGenerativeAI(key);
      const model = genAI.getGenerativeModel({ model: agent.modelName || "gemini-2.5-flash" });
      const result = await model.generateContent([systemPrompt, userPrompt]);
      aiResponse = result.response.text();
    } else {
      const key = aiConfig?.openaiKey || process.env.OPENAI_API_KEY;
      if (!key) throw new Error("OpenAI API Key missing for tenant");

      const openai = new OpenAI({ apiKey: key });
      const completion = await openai.chat.completions.create({
        model: agent.modelName || "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
      });
      aiResponse = completion.choices[0]?.message?.content || "";
    }

    if (!payload.variables) payload.variables = {};
    payload.variables.last_ai_response = aiResponse;
    Logger.info(`[WorkflowAction:AI] Response received (${aiResponse.length} chars)`);
  }
}

// ==========================================
// ️ WORKFLOW ENGINE
// ==========================================

class WorkflowEngine extends EventEmitter {
  private handlers: Record<string, WorkflowActionHandler> = {};

  constructor() {
    super();
    this.registerHandlers();
    this.initializeListeners();
  }

  private registerHandlers() {
    this.handlers["action_email"] = new EmailActionHandler();
    this.handlers["action_task"] = new TaskActionHandler();
    this.handlers["AI_AGENT"] = new AIActionHandler();
    this.handlers["action_ai"] = new AIActionHandler();
  }

  private initializeListeners() {
    this.on("DEAL_UPDATED", this.handleDealUpdated);
    this.on("DEAL_CREATED", this.handleDealCreated);
  }

  private handleDealCreated = async (payload: DealPayload): Promise<void> => {
    Logger.info(`[WorkflowEngine] Event: DEAL_CREATED (${payload.dealId})`);
    await this.processEvent("DEAL_CREATED", payload);
  };

  private handleDealUpdated = async (payload: DealPayload): Promise<void> => {
    Logger.info(`[WorkflowEngine] Event: DEAL_UPDATED (${payload.dealId})`);
    await this.processEvent("DEAL_UPDATED", payload);
  };

  private async processEvent(eventName: string, payload: DealPayload): Promise<void> {
    try {
      const activeWorkflows = await workflowRepository.findMany({
        where: {
          companyId: payload.companyId,
          isActive: true,
          triggerType: "EVENT",
        },
      });

      for (const rawWorkflow of activeWorkflows) {
        const workflow = rawWorkflow as unknown as WorkflowDefinition;
        const config = workflow.triggerConfig;

        if (config?.event === eventName) {
          let conditionMet = true;
          if (config.condition?.stage && config.condition.stage !== payload.newStage) {
            conditionMet = false;
          }

          if (conditionMet) {
            this.executeWorkflow(workflow, payload).catch((e: Error) =>
              Logger.error(`[WorkflowEngine] Execution Error: ${workflow.id}`, e),
            );
          }
        }
      }
    } catch (error) {
      Logger.error(`[WorkflowEngine] Critical Event Error ${eventName}:`, error as Error);
    }
  }

  private async executeWorkflow(workflow: WorkflowDefinition, payload: DealPayload): Promise<void> {
    const execution = await workflowExecutionRepository.create({
      data: {
        workflowId: workflow.id,
        companyId: workflow.companyId,
        status: "PENDING",
      },
    });

    const stepLogs: Array<{ nodeId: string; type: string; timestamp: Date; status: string; error?: string }> = [];

    try {
      const { nodes, edges } = workflow;
      if (!nodes || nodes.length === 0) return;

      const startNode = nodes.find((n) => n.type === "START" || n.type === "trigger_deal");
      if (!startNode) throw new Error("Could not find a valid START node in graph.");

      const systemUser = await userRepository.findFirst({
        where: { companyId: workflow.companyId },
        orderBy: { createdAt: "asc" },
      });

      if (!systemUser) throw new Error("No system user found for company. Cannot execute actions.");

      let currentNodes = [startNode];
      const visited = new Set<string>();

      while (currentNodes.length > 0) {
        const nextBatch: WorkflowNode[] = [];

        for (const node of currentNodes) {
          if (visited.has(node.id)) continue;
          visited.add(node.id);

          const handler = this.handlers[node.type];
          if (handler) {
            try {
              await handler.execute(node, payload, workflow.companyId, systemUser.id);
              stepLogs.push({ nodeId: node.id, type: node.type, timestamp: new Date(), status: "COMPLETED" });
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              stepLogs.push({ nodeId: node.id, type: node.type, timestamp: new Date(), status: "FAILED", error: msg });
              throw err;
            }
          } else {
            stepLogs.push({ nodeId: node.id, type: node.type, timestamp: new Date(), status: "SKIPPED_NO_HANDLER" });
          }

          const outwardEdges = (edges || []).filter((e) => e.source === node.id);
          for (const edge of outwardEdges) {
            const neighbor = nodes.find((n) => n.id === edge.target);
            if (neighbor) nextBatch.push(neighbor);
          }
        }
        currentNodes = nextBatch;
      }

      await workflowExecutionRepository.update({
        where: { id: execution.id },
        data: { 
          status: "SUCCESS", 
          completedAt: new Date(),
          logs: stepLogs as unknown as Prisma.JsonValue
        },
      });

      Logger.info(`[WorkflowEngine] Execution SUCCESS: ${execution.id}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Graph Execution Failed";
      Logger.error(`[WorkflowEngine] Execution FAILED (${execution.id}): ${errorMessage}`);
      
      await workflowExecutionRepository.update({
        where: { id: execution.id },
        data: { 
          status: "FAILED", 
          error: errorMessage, 
          completedAt: new Date(),
          logs: stepLogs as unknown as Prisma.JsonValue
        },
      });
    }
  }
}

export const workflowEngine = new WorkflowEngine();
