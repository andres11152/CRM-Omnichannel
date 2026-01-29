import { EventEmitter } from "events";
import { prisma } from "@/config/database";
import { Logger } from "@/utils/logger";
import { emailService } from "./email/email.service";

class WorkflowEngine extends EventEmitter {
  constructor() {
    super();
    this.initializeListeners();
  }

  private initializeListeners() {
    this.on("DEAL_UPDATED", this.handleDealUpdated);
    this.on("DEAL_CREATED", this.handleDealCreated);
  }

  private handleDealCreated = async (payload: {
    dealId: string;
    companyId: string;
  }) => {
    Logger.info(
      `[WorkflowEngine] Processing DEAL_CREATED for deal ${payload.dealId}`
    );
    await this.processEvent("DEAL_CREATED", payload);
  };

  private handleDealUpdated = async (payload: {
    dealId: string;
    companyId: string;
    previousStage: string;
    newStage: string;
  }) => {
    Logger.info(
      `[WorkflowEngine] Processing DEAL_UPDATED for deal ${payload.dealId}`
    );
    await this.processEvent("DEAL_UPDATED", payload);
  };

  private async processEvent(eventName: string, payload: any) {
    try {
      // Find workflows triggered by this event
      const workflows = await prisma.workflow.findMany({
        where: {
          companyId: payload.companyId,
          isActive: true,
          triggerType: "EVENT",
        } as any,
      });

      for (const workflow of workflows) {
        const config = (workflow as any).triggerConfig;

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
            this.executeWorkflow(workflow, payload);
          }
        }
      }
    } catch (error) {
      Logger.error(
        `[WorkflowEngine] Error processing event ${eventName}:`,
        error
      );
    }
  }

  private async executeWorkflow(workflow: any, payload: any) {
    Logger.info(
      `[WorkflowEngine] Executing workflow ${workflow.name} (${workflow.id})`
    );

    // Create Execution Log
    const execution = await prisma.workflowExecution.create({
      data: {
        workflowId: workflow.id,
        status: "PENDING",
      },
    });

    try {
      const nodes = workflow.nodes as any;
      if (!Array.isArray(nodes) || nodes.length === 0) {
        Logger.warn(
          `[WorkflowEngine] Workflow ${workflow.id} has no valid nodes`
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
          `[WorkflowEngine] No user found for company ${workflow.companyId} to execute workflow`
        );
        return;
      }

      // Simple sequential execution for MVP
      for (const node of nodes) {
        if (node.type === "action_email") {
          const recipientOption = node.data?.options?.[0]; // "Cliente" or specific email
          const subject =
            node.data?.options?.[1] ||
            node.data?.params?.subject ||
            "Sin Asunto";
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
                `[WorkflowEngine] No email/contact found for Deal ${payload.dealId}`
              );
              continue; // Skip execution
            }
          } else if (recipientOption.includes("@")) {
            targetEmail = recipientOption;
            // Optionally try to find contact by email to link history
            const contact = await prisma.contact.findFirst({
              where: { email: targetEmail, companyId: workflow.companyId },
            });
            if (contact) targetContactId = contact.id;
          }

          if (targetEmail) {
            Logger.info(
              `[WorkflowEngine] Action: Sending Real Email to ${targetEmail} | Subject: ${subject}`
            );

            // 2. Send Real Email via SMTP
            await emailService
              .sendEmail({
                companyId: workflow.companyId,
                to: [targetEmail],
                subject: subject,
                bodyHtml: body.replace(/\n/g, "<br>"),
                bodyText: body,
                contactId: targetContactId,
                from:
                  process.env.DEFAULT_SENDER_EMAIL || "automation@reply.com",
              })
              .catch((err) => {
                Logger.error(
                  `[WorkflowEngine] Failed to send email via SMTP`,
                  err
                );
                throw err; // Re-throw to fail workflow step
              });
          }

          // 3. Log email as an Activity in the CRM
          await prisma.activity
            .create({
              data: {
                companyId: workflow.companyId,
                type: "EMAIL",
                subject: `📧 Email Automático: ${subject}`,
                description: `Destinatario: ${targetEmail}\n\n${body}`,
                dealId: payload.dealId,
                status: "COMPLETED",
                createdById: systemUser.id,
              },
            })
            .catch((e) => Logger.error("Failed to log email activity", e));
        }

        if (node.type === "action_task") {
          Logger.info(
            `[WorkflowEngine] Action: Creating Task for ${payload.dealId}`
          );

          // Implement task creation logic here
          await prisma.activity
            .create({
              data: {
                companyId: workflow.companyId,
                type: "TASK",
                subject:
                  node.data?.label || `Tarea Automática: ${workflow.name}`,
                description:
                  node.data?.content ||
                  `Generada por workflow para el deal ${payload.dealId}`,
                dealId: payload.dealId,
                status: "PENDING",
                createdById: systemUser.id, // Use a real user ID
              },
            })
            .catch((e) => Logger.error("Failed to create auto task", e));
        }
      }

      await prisma.workflowExecution.update({
        where: { id: execution.id },
        data: { status: "SUCCESS", completedAt: new Date() },
      });
    } catch (error: any) {
      Logger.error(`[WorkflowEngine] Execution Failed: ${error.message}`);
      await prisma.workflowExecution.update({
        where: { id: execution.id },
        data: {
          status: "FAILED",
          error: error.message,
          completedAt: new Date(),
        },
      });
    }
  }
}

export const workflowEngine = new WorkflowEngine();
