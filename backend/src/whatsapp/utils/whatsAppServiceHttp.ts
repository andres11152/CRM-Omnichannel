import axios from "axios";

const WHATSAPP_SERVICE_URL = process.env.WHATSAPP_SERVICE_URL || "http://localhost:4001";

// Single authenticated HTTP client for every backend -> whatsapp-service call.
// The Baileys socket for a session lives exclusively in whatsapp-service now,
// so any action needing a live socket must go through its HTTP surface, which
// is gated behind WHATSAPP_INTERNAL_SECRET (whatsapp-service/src/middleware/internalAuth.ts).
export const whatsappServiceHttp = axios.create({
  baseURL: WHATSAPP_SERVICE_URL,
  headers: process.env.WHATSAPP_INTERNAL_SECRET
    ? { "x-internal-service-key": process.env.WHATSAPP_INTERNAL_SECRET }
    : undefined,
});

export async function executeWhatsAppCommand<T>(
  companyId: string,
  command: string,
  args: unknown[],
): Promise<T> {
  const res = await whatsappServiceHttp.post<{ success: boolean; result: T }>(
    "/commands/execute",
    { companyId, command, args },
  );
  return res.data.result;
}

export default whatsappServiceHttp;
