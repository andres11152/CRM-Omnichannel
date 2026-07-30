import { executeHttpRequestAction } from "@/services/nodeActions/httpRequestAction";
import { resolveVariables } from "@/utils/variableResolver";
import {
  DealPayload,
  WorkflowNode,
  WorkflowActionHandler,
} from "@/types/workflow.types";
import { Logger } from "@/utils/logger";

export class HttpRequestActionHandler implements WorkflowActionHandler {
  async execute(
    node: WorkflowNode,
    payload: DealPayload,
  ): Promise<void> {
    const context = payload as unknown as Record<string, unknown>;

    const url = resolveVariables(node.data?.webhookUrl || node.data?.url || "", context);
    if (!url) {
      Logger.warn(`[WorkflowAction:HttpRequest] node ${node.id} has no URL configured`);
      return;
    }

    const method = String(node.data?.httpMethod || node.data?.method || "POST").toUpperCase();

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (node.data?.headers) {
      try {
        const parsed = JSON.parse(resolveVariables(node.data.headers, context));
        if (parsed && typeof parsed === "object") {
          for (const [key, value] of Object.entries(parsed)) {
            headers[key] = String(value);
          }
        }
      } catch (parseErr) {
        Logger.warn(`[WorkflowAction:HttpRequest] node ${node.id} has invalid JSON in "headers": ${String(parseErr)}`);
      }
    }
    if (node.data?.authHeader) {
      headers["Authorization"] = resolveVariables(node.data.authHeader, context);
    }

    const rawBody = node.data?.bodyTemplate || node.data?.body;
    const bodyPayload = rawBody
      ? JSON.parse(resolveVariables(rawBody, context))
      : { dealId: payload.dealId, variables: payload.variables };

    try {
      const result = await executeHttpRequestAction(url, method, headers, bodyPayload);

      if (!payload.variables) payload.variables = {};
      payload.variables.http_status = result.status;
      payload.variables.http_response = result.responseText;
      const customVariable = node.data?.variable;
      if (customVariable) payload.variables[customVariable] = result.responseText;

      Logger.info(`[WorkflowAction:HttpRequest] ${method} ${url} -> ${result.status}`);
    } catch (error: unknown) {
      if (!payload.variables) payload.variables = {};
      payload.variables.http_status = 0;
      payload.variables.http_error = error instanceof Error ? error.message : String(error);
      Logger.error(`[WorkflowAction:HttpRequest] ${method} ${url} failed:`, error);
    }
  }
}
