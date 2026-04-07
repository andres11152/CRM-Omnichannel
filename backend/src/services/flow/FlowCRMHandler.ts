/**
 *  FLOW CRM HANDLER
 *
 * CRM mutation nodes:
 * - handleCreateDealNode: Creates deals in the sales pipeline
 * - handleUpdateContactNode: Updates contact fields (native + custom)
 */

import { flowSessionRepository } from "@/repositories/FlowSessionRepository";
import { contactRepository } from "@/repositories/ContactRepository";
import { Logger } from "@/utils/logger";
import { getErrorMessage } from "@/utils/errorHelpers";
import { Prisma } from "@prisma/client";
import type {
  FlowSessionState,
  FlowVariables,
  FlowNode,
  FlowStructure,
} from "@/types/flow.types";

export class FlowCRMHandler {
  // ────────────────────────────────────────────────
  // CREATE DEAL NODE
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
    try {
      const dealTitle = this.replaceVariables(
        node.data.title || "Nuevo Deal",
        session.variables,
      );
      const dealValue = parseFloat(node.data.value || "0");

      let pipeline = await flowSessionRepository.findDefaultPipeline(companyId);
      if (!pipeline) {
        pipeline = await flowSessionRepository.findAnyPipeline(companyId);
      }

      const targetPipelineId = pipeline?.id;
      if (!targetPipelineId) throw new Error("No pipeline found");

      const defaultStage =
        await flowSessionRepository.findFirstStage(targetPipelineId);
      const targetStageId = defaultStage?.id;
      if (!targetStageId) throw new Error("No stage found");

      await flowSessionRepository.createDeal({
        title: dealTitle,
        value: dealValue,
        currency: "USD",
        company: { connect: { id: companyId } },
        pipeline: { connect: { id: targetPipelineId } },
        stage: { connect: { id: targetStageId } },
      });

      await moveToNextNode(session.id, node.id, flowStructure);
      return node.data.confirmation || null;
    } catch (error: unknown) {
      const errorMsg = getErrorMessage(error);
      Logger.error("[FlowExecutor] Error creating deal:", errorMsg);
      await moveToNextNode(session.id, node.id, flowStructure);
      return "Hubo un problema al crear el deal. Continuaremos con el proceso.";
    }
  }

  // ────────────────────────────────────────────────
  // UPDATE CONTACT NODE
  // ────────────────────────────────────────────────

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
    Logger.info(
      `[FlowExecutor] [BUILD] Processing UPDATE_CONTACT node ${node.id} for Contact ${session.contactId}`,
    );

    let fieldsToUpdate: Record<string, unknown> = {
      ...(node.data.fields || {}),
    };

    if (node.data.name) fieldsToUpdate["name"] = node.data.name;
    if (node.data.email) fieldsToUpdate["email"] = node.data.email;
    if (node.data.phone) fieldsToUpdate["phone"] = node.data.phone;

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
            `[FlowExecutor] [WARNING] Invalid JSON in customFields for node ${node.id}: ${errMsg}`,
          );
        }
      } else if (
        typeof node.data.customFields === "object" &&
        node.data.customFields !== null
      ) {
        fieldsToUpdate = {
          ...fieldsToUpdate,
          ...(node.data.customFields as Record<string, unknown>),
        };
      }
    }

    const prismaUpdateData: Prisma.ContactUpdateInput = {};
    const customFieldsUpdates: Record<string, Prisma.InputJsonValue> = {};

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

    for (const [key, value] of Object.entries(fieldsToUpdate)) {
      if (typeof value !== "string" && typeof value !== "number") continue;

      const resolvedValue = this.replaceVariables(
        String(value),
        session.variables,
      );

      if (NATIVE_FIELDS.includes(key)) {
        prismaUpdateData[key] = resolvedValue;
      } else {
        customFieldsUpdates[key] = resolvedValue;
      }
    }

    if (Object.keys(customFieldsUpdates).length > 0) {
      try {
        const currentContact = await contactRepository.findFirst({
          where: { id: session.contactId, companyId: session.companyId },
          select: { customFields: true },
        });

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
          `[FlowExecutor] [ERROR] Error fetching contact for custom fields merge: ${err}`,
        );
      }
    }

    if (Object.keys(prismaUpdateData).length > 0) {
      try {
        await contactRepository.update(
          session.companyId,
          session.contactId,
          prismaUpdateData as Prisma.ContactUncheckedUpdateInput,
        );
        Logger.info(
          `[FlowExecutor] [OK] Contact ${session.contactId} updated successfully.`,
        );
      } catch (error) {
        Logger.error(
          `[FlowExecutor] [ERROR] Failed to update contact ${session.contactId}: ${error}`,
        );
      }
    }

    await moveToNextNode(session.id, node.id, flowStructure);
    return null;
  }

  // ────────────────────────────────────────────────
  // UTILITY
  // ────────────────────────────────────────────────

  private replaceVariables(text: string, variables: FlowVariables): string {
    let result = text;
    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`{{${key}}}`, "g");
      result = result.replace(regex, String(value));
    }
    return result;
  }
}
