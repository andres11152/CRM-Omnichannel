import { FlowSessionState, FlowStructure, FlowNode, FlowVariables } from "@/types/flow.types";
import { flowSessionRepository } from "@/repositories/FlowSessionRepository";
import { Logger } from "@/utils/logger";
import { replaceVariables } from "../utils/FlowUtils";

const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 500;

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retries: number,
): Promise<Response> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      const response = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timeout);
      return response;
    } catch (err) {
      if (attempt === retries) throw err;
      const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
      Logger.warn(`[FlowExec] HTTP_REQUEST attempt ${attempt} failed, retrying in ${delay}ms...`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw new Error("Unreachable");
}

export class HttpRequestNodeHandler {
  async handle(
    node: FlowNode,
    session: FlowSessionState,
    flowStructure: FlowStructure,
    moveToNextNode: (sId: string, cId: string, fs: FlowStructure, v?: FlowVariables) => Promise<void>,
    moveToSpecificNode: (sId: string, tId: string) => Promise<void>,
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

      const response = await fetchWithRetry(
        url,
        {
          method,
          headers,
          body: method !== "GET" ? JSON.stringify(bodyPayload) : undefined,
        },
        MAX_RETRIES,
      );

      let responseData: Record<string, unknown> = {};
      try {
        responseData = (await response.json()) as Record<string, unknown>;
      } catch {
        responseData = { status: response.status, text: await response.text() };
      }

      const updatedVars: FlowVariables = {
        ...session.variables,
        http_status: response.status,
        http_response: JSON.stringify(responseData).substring(0, 500),
      };

      await flowSessionRepository.updateSession(session.id, { variables: updatedVars });

      // A8: Route to error branch on non-2xx if configured
      if (!response.ok && node.data.errorNodeId) {
        Logger.warn(`[FlowExec] HTTP_REQUEST ${method} ${url} -> ${response.status}. Routing to error branch.`);
        await moveToSpecificNode(session.id, node.data.errorNodeId as string);
        return null;
      }

      await moveToNextNode(session.id, node.id, flowStructure, updatedVars);
      Logger.info(`[FlowExec] HTTP_REQUEST ${method} ${url} -> ${response.status}`);
      return null;
    } catch (error: unknown) {
      Logger.error(`[FlowExec] HTTP_REQUEST failed for node ${node.id}:`, error);

      const errorVars: FlowVariables = {
        ...session.variables,
        http_status: 0,
        http_error: error instanceof Error ? error.message : String(error),
      };
      await flowSessionRepository.updateSession(session.id, { variables: errorVars });

      // A8: Route to error branch on exception if configured
      if (node.data.errorNodeId) {
        await moveToSpecificNode(session.id, node.data.errorNodeId as string);
      } else {
        await moveToNextNode(session.id, node.id, flowStructure, errorVars);
      }
      return null;
    }
  }
}
