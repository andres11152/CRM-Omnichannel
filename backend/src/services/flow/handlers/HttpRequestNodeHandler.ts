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
    const url = replaceVariables(
      node.data.webhookUrl || node.data.url || (node.data as Record<string, unknown>).url as string || "",
      session.variables,
    );
    // `httpMethod` is the canonical field; `method` is what the FlowBuilder UI
    // (IntegrationNodeProperties.tsx) actually writes — both are honored.
    const rawMethod = node.data.httpMethod || (node.data as Record<string, unknown>).method as string || "POST";
    const method = String(rawMethod).toUpperCase();

    if (!url) {
      Logger.warn(`[FlowExec] HTTP_REQUEST node ${node.id} has no URL configured`);
      await moveToNextNode(session.id, node.id, flowStructure);
      return null;
    }

    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };

      // `headers` is a JSON object of arbitrary custom headers (what the UI
      // exposes); `authHeader` is a single legacy bearer-style field. Both
      // are applied, with explicit custom headers taking precedence.
      const rawHeaders = (node.data as Record<string, unknown>).headers as string | undefined;
      if (rawHeaders) {
        try {
          const parsedHeaders = JSON.parse(replaceVariables(rawHeaders, session.variables));
          if (parsedHeaders && typeof parsedHeaders === "object") {
            for (const [key, value] of Object.entries(parsedHeaders)) {
              headers[key] = String(value);
            }
          }
        } catch (parseErr) {
          Logger.warn(`[FlowExec] HTTP_REQUEST node ${node.id} has invalid JSON in "headers": ${String(parseErr)}`);
        }
      }
      if (node.data.authHeader) {
        headers["Authorization"] = replaceVariables(String(node.data.authHeader), session.variables);
      }

      // `bodyTemplate` is canonical; `body` is what the UI writes.
      const rawBody = node.data.bodyTemplate || (node.data as Record<string, unknown>).body as string | undefined;
      const bodyPayload = rawBody
        ? JSON.parse(replaceVariables(String(rawBody), session.variables))
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

      const responseText = JSON.stringify(responseData).substring(0, 500);
      const updatedVars: FlowVariables = {
        ...session.variables,
        http_status: response.status,
        http_response: responseText,
      };
      // "Guardar Respuesta en Variable" in the UI (`node.data.variable`) —
      // stores the same response under a caller-chosen name too, so a later
      // node can reference `{{api_response}}` instead of the fixed name.
      const customVariable = (node.data as Record<string, unknown>).variable as string | undefined;
      if (customVariable) {
        updatedVars[customVariable] = responseText;
      }

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
