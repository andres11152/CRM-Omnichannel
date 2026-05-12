import { FlowSessionState, FlowStructure, FlowNode, FlowVariables } from "@/types/flow.types";
import { flowSessionRepository } from "@/repositories/FlowSessionRepository";
import { Logger } from "@/utils/logger";
import { replaceVariables } from "../utils/FlowUtils";

export class HttpRequestNodeHandler {
  async handle(
    node: FlowNode,
    session: FlowSessionState,
    flowStructure: FlowStructure,
    moveToNextNode: (sId: string, cId: string, fs: FlowStructure, v?: FlowVariables) => Promise<void>
  ): Promise<string | null> {
    const url = replaceVariables(node.data.webhookUrl || node.data.url || "", session.variables);
    const method = (node.data.httpMethod || "POST").toUpperCase();

    if (!url) {
      Logger.warn(`[FlowExec] HTTP_REQUEST node ${node.id} has no URL configured`);
      await moveToNextNode(session.id, node.id, flowStructure);
      return null;
    }

    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (node.data.authHeader) {
        headers["Authorization"] = replaceVariables(String(node.data.authHeader), session.variables);
      }

      const bodyPayload = node.data.bodyTemplate
        ? JSON.parse(replaceVariables(String(node.data.bodyTemplate), session.variables))
        : { contactId: session.contactId, variables: session.variables };

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(url, {
        method,
        headers,
        body: method !== "GET" ? JSON.stringify(bodyPayload) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeout);

      let responseData: Record<string, unknown> = {};
      try {
        responseData = await response.json() as Record<string, unknown>;
      } catch {
        responseData = { status: response.status, text: await response.text() };
      }

      const updatedVars: FlowVariables = {
        ...session.variables,
        http_status: response.status,
        http_response: JSON.stringify(responseData).substring(0, 500),
      };

      await flowSessionRepository.updateSession(session.id, { variables: updatedVars });
      await moveToNextNode(session.id, node.id, flowStructure, updatedVars);

      Logger.info(`[FlowExec] HTTP_REQUEST ${method} ${url} -> ${response.status}`);
      return null;
    } catch (error: unknown) {
      Logger.error(`[FlowExec] HTTP_REQUEST failed for node ${node.id}:`, error);
      await moveToNextNode(session.id, node.id, flowStructure);
      return null;
    }
  }
}
