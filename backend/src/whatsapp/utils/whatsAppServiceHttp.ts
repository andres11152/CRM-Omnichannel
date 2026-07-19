import axios from "axios";
import { proto, WAMessage } from "@whiskeysockets/baileys";
import { Logger } from "@/utils/logger";

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

/**
 * Remote media download through whatsapp-service (which owns the live socket).
 *
 * [DOCS · Baileys] downloadMediaMessage with reuploadRequest = sock.updateMediaMessage
 * is the official recovery for expired CDN media: the linked phone re-uploads the
 * file. Since the microservice split the backend has no socket, so that recovery
 * must run inside whatsapp-service — this helper ships the message there as a
 * protobuf blob (lossless for mediaKey/fileEncSha256 byte fields) and gets the
 * downloaded bytes back.
 */
export async function downloadMediaViaService(
  companyId: string,
  message: WAMessage,
): Promise<Buffer | null> {
  try {
    const encoded = Buffer.from(
      proto.WebMessageInfo.encode(
        proto.WebMessageInfo.create(message as proto.IWebMessageInfo),
      ).finish(),
    ).toString("base64");

    const result = await executeWhatsAppCommand<{ buffer: string; size: number }>(
      companyId,
      "downloadMedia",
      [encoded],
    );
    if (result?.buffer) {
      return Buffer.from(result.buffer, "base64");
    }
    return null;
  } catch (err) {
    Logger.warn(
      `[whatsappServiceHttp] Remote media download failed for ${message.key?.id}: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}

export default whatsappServiceHttp;
