import { FlowSessionState, FlowStructure, FlowNode } from "@/types/flow.types";
import { messageTemplateRepository } from "@/repositories/MessageTemplateRepository";
import { Logger } from "@/utils/logger";
import { replaceVariables } from "../utils/FlowUtils";

interface StoredTemplateComponent {
  type: "HEADER" | "BODY" | "FOOTER" | "BUTTONS";
  text?: string;
}

export class SendTemplateNodeHandler {
  /**
   * A SEND_TEMPLATE node is registered as an OUTPUT node type in
   * FlowExecutor.ts — this handler returns hydrated body TEXT exactly like
   * SendNodeHandler does for SEND_MESSAGE, reusing the same proven
   * output-dispatch pipeline instead of inventing a new WhatsApp-sending
   * path here.
   */
  async handle(
    node: FlowNode,
    session: FlowSessionState,
    flowStructure: FlowStructure,
    moveToNextNode: (sId: string, cId: string, fs: FlowStructure) => Promise<void>,
  ): Promise<string | null> {
    const templateName = node.data.templateName || "";

    if (!templateName) {
      Logger.warn(`[FlowExec] SEND_TEMPLATE node ${node.id} has no template configured`);
      await moveToNextNode(session.id, node.id, flowStructure);
      return null;
    }

    // `templateParams` (string[]) is the canonical field; `templateVariables`
    // is what the FlowBuilder UI (IntegrationNodeProperties.tsx) actually
    // writes — a JSON-array STRING typed into a textarea, e.g. '["{{nombre}}"]'.
    const rawUiVariables = (node.data as Record<string, unknown>).templateVariables as string | undefined;
    let templateParams = node.data.templateParams as string[] | undefined;
    if (!templateParams && rawUiVariables) {
      try {
        const parsed = JSON.parse(rawUiVariables);
        if (Array.isArray(parsed)) templateParams = parsed;
      } catch (err) {
        Logger.warn(`[FlowExec] SEND_TEMPLATE node ${node.id} has invalid JSON in "templateVariables": ${String(err)}`);
      }
    }

    const resolvedParams = (templateParams || []).map((p: string) =>
      replaceVariables(p, session.variables),
    );

    const template = await messageTemplateRepository.findMany({
      where: { companyId: session.companyId, name: templateName, channel: "WHATSAPP" },
      take: 1,
    });

    if (!template[0]) {
      Logger.warn(
        `[FlowExec] SEND_TEMPLATE node ${node.id}: no approved WhatsApp template named "${templateName}" found for company ${session.companyId}. Advancing without sending.`,
      );
      await moveToNextNode(session.id, node.id, flowStructure);
      return null;
    }

    const components = template[0].components as unknown as StoredTemplateComponent[];
    let bodyText = components
      .filter((c) => c.type === "BODY")
      .map((c) => c.text || "")
      .join("\n");

    // WhatsApp HSM templates use positional placeholders ({{1}}, {{2}}, ...);
    // `resolvedParams` is already flow-variable-hydrated and positional.
    resolvedParams.forEach((value, index) => {
      bodyText = bodyText.replace(new RegExp(`{{\\s*${index + 1}\\s*}}`, "g"), value);
    });

    await moveToNextNode(session.id, node.id, flowStructure);

    Logger.info(`[FlowExec] SEND_TEMPLATE: Sending template "${templateName}" with ${resolvedParams.length} params`);
    return bodyText || null;
  }
}
