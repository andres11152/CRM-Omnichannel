import { EventEmitter } from "events";
import { prisma } from "@/config/database";
import { Logger } from "@/utils/logger";
import { emailService } from "./email/emailService";
import {
  DealPayload,
  WorkflowNode,
  WorkflowTriggerConfig,
  WorkflowDefinition,
} from "@/types/workflow.types";

// ==========================================
// ⚙️ WORKFLOW ENGINE
// ==========================================

class WorkflowEngine extends EventEmitter {
  constructor() {
    super();
    this.initializeListeners();
  }

  private initializeListeners() {
    this.on("DEAL_UPDATED", this.handleDealUpdated);
    this.on("DEAL_CREATED", this.handleDealCreated);
  }

  private handleDealCreated = async (payload: DealPayload) => {
    Logger.info(
      `[WorkflowEngine] Processing DEAL_CREATED for deal ${payload.dealId}`,
    );
    await this.processEvent("DEAL_CREATED", payload);
  };

  private handleDealUpdated = async (payload: DealPayload) => {
    Logger.info(
      `[WorkflowEngine] Processing DEAL_UPDATED for deal ${payload.dealId}`,
    );
    await this.processEvent("DEAL_UPDATED", payload);
  };

  private async processEvent(eventName: string, payload: DealPayload) {
    try {
      // Find workflows triggered by this event
      const workflows = await prisma.workflow.findMany({
        where: {
          companyId: payload.companyId,
          isActive: true,
          triggerType: "EVENT",
        },
      });

      for (const workflow of workflows) {
        // Safe cast for JSON fields
        const config =
          workflow.triggerConfig as unknown as WorkflowTriggerConfig;

        // Check if event matches
        if (config?.event === eventName) {
          // Check conditions (e.g. stage changed to WON)
          let conditionMet = true;
          if (config.condition) {
            // Simple condition check: "stage" === "WON"
            // In a real engine, this would be a complex rule evaluator
            if (
              config.condition.stage &&
              config.condition.stage !== payload.newStage
            ) {
              conditionMet = false;
            }
          }

          if (conditionMet) {
            // Cast workflow to expected definition including JSON types
            this.executeWorkflow(
              workflow as unknown as WorkflowDefinition,
              payload,
            );
          }
        }
      }
    } catch (error) {
      Logger.error(
        `[WorkflowEngine] Error processing event ${eventName}:`,
        error as Error,
      );
    }
  }

  private async executeWorkflow(
    workflow: WorkflowDefinition,
    payload: DealPayload,
  ) {
    Logger.info(
      `[WorkflowEngine] Executing workflow ${workflow.name} (${workflow.id})`,
    );

    // Create Execution Log
    const execution = await prisma.workflowExecution.create({
      data: {
        workflowId: workflow.id,
        status: "PENDING",
      },
    });

    try {
      const nodes = workflow.nodes as unknown as WorkflowNode[];

      if (!Array.isArray(nodes) || nodes.length === 0) {
        Logger.warn(
          `[WorkflowEngine] Workflow ${workflow.id} has no valid nodes`,
        );
        return;
      }

      // Find a valid user to be the "creator" (System or First Admin)
      const systemUser = await prisma.user.findFirst({
        where: { companyId: workflow.companyId },
        orderBy: { createdAt: "asc" }, // Usually the owner/first user
      });

      if (!systemUser) {
        Logger.error(
          `[WorkflowEngine] No user found for company ${workflow.companyId} to execute workflow`,
        );
        return;
      }

      // Simple sequential execution for MVP
      for (const node of nodes) {
        if (node.type === "action_email") {
          await this.executeEmailAction(
            node,
            payload,
            workflow.companyId,
            systemUser.id,
          );
        } else if (node.type === "action_task") {
          await this.executeTaskAction(
            node,
            payload,
            workflow.companyId,
            workflow.name,
            systemUser.id,
          );
        }
      }

      await prisma.workflowExecution.update({
        where: { id: execution.id },
        data: { status: "SUCCESS", completedAt: new Date() },
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      Logger.error(`[WorkflowEngine] Execution Failed: ${errorMessage}`);

      await prisma.workflowExecution.update({
        where: { id: execution.id },
        data: {
          status: "FAILED",
          error: errorMessage,
          completedAt: new Date(),
        },
      });
    }
  }

  private async executeEmailAction(
    node: WorkflowNode,
    payload: DealPayload,
    companyId: string,
    systemUserId: string,
  ) {
    const recipientOption = node.data?.options?.[0]; // "Cliente" or specific email
    const subject =
      node.data?.options?.[1] || node.data?.params?.subject || "Sin Asunto";
    const body = node.data?.content || node.data?.params?.body || "";

    // 1. Resolve Recipient Email & Contact
    let targetEmail = "";
    let targetContactId: string | undefined = undefined;

    if (recipientOption === "Cliente" || !recipientOption) {
      // Fetch Deal to get Contact
      const deal = await prisma.deal.findUnique({
        where: { id: payload.dealId },
        include: { contact: true },
      });
      if (deal?.contact?.email) {
        targetEmail = deal.contact.email;
        targetContactId = deal.contact.id;
      } else {
        Logger.warn(
          `[WorkflowEngine] No email/contact found for Deal ${payload.dealId}`,
        );
        return; // Skip execution
      }
    } else if (recipientOption.includes("@")) {
      targetEmail = recipientOption;
      // Optionally try to find contact by email to link history
      const contact = await prisma.contact.findFirst({
        where: { email: targetEmail, companyId },
      });
      if (contact) targetContactId = contact.id;
    }

    if (targetEmail) {
      Logger.info(
        `[WorkflowEngine] Action: Sending Real Email to ${targetEmail} | Subject: ${subject}`,
      );

      // 2. Send Real Email via SMTP
      await emailService.sendEmail({
        companyId,
        to: [targetEmail],
        subject: subject,
        bodyHtml: body.replace(/\n/g, "<br>"),
        bodyText: body,
        contactId: targetContactId,
        from: process.env.DEFAULT_SENDER_EMAIL || "automation@reply.com",
      });

      // 3. Log email as an Activity in the CRM
      await prisma.activity
        .create({
          data: {
            companyId,
            type: "EMAIL",
            subject: `📧 Email Automático: ${subject}`,
            description: `Destinatario: ${targetEmail}\n\n${body}`,
            dealId: payload.dealId,
            status: "COMPLETED",
            createdById: systemUserId,
          },
        })
        .catch((e) => Logger.error("Failed to log email activity", e as Error));
    }
  }

  private async executeTaskAction(
    node: WorkflowNode,
    payload: DealPayload,
    companyId: string,
    workflowName: string,
    systemUserId: string,
  ) {
    Logger.info(`[WorkflowEngine] Action: Creating Task for ${payload.dealId}`);

    // Implement task creation logic here
    await prisma.activity
      .create({
        data: {
          companyId,
          type: "TASK",
          subject: node.data?.label || `Tarea Automática: ${workflowName}`,
          description:
            node.data?.content ||
            `Generada por workflow para el deal ${payload.dealId}`,
          dealId: payload.dealId,
          status: "PENDING",
          createdById: systemUserId,
        },
      })
      .catch((e) => Logger.error("Failed to create auto task", e as Error));
  }
}

export const workflowEngine = new WorkflowEngine();
