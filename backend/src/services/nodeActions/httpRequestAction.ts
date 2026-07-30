import { Logger } from "@/utils/logger";

const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 500;

export interface HttpRequestActionResult {
  status: number;
  responseText: string;
  ok: boolean;
}

/**
 * Portable core of the "HTTP Request" node — a plain fetch-with-retry that
 * takes already-resolved primitives (no session, no FlowStructure). Shared
 * by HttpRequestNodeHandler (chatbot) and HttpRequestActionHandler (CRM
 * workflows).
 */
export async function executeHttpRequestAction(
  url: string,
  method: string,
  headers: Record<string, string>,
  body: unknown,
): Promise<HttpRequestActionResult> {
  const response = await fetchWithRetry(
    url,
    {
      method,
      headers,
      body: method !== "GET" ? JSON.stringify(body) : undefined,
    },
    MAX_RETRIES,
  );

  let responseData: unknown;
  try {
    responseData = await response.json();
  } catch {
    responseData = { status: response.status, text: await response.text() };
  }

  return {
    status: response.status,
    responseText: JSON.stringify(responseData).substring(0, 500),
    ok: response.ok,
  };
}

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
      Logger.warn(`[NodeAction:HttpRequest] attempt ${attempt} failed, retrying in ${delay}ms...`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw new Error("Unreachable");
}
