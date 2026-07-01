import axios from "axios";
import { IWhatsAppProvider } from "../core/interfaces/IWhatsAppProvider";
import { WhatsAppSessionRepository } from "@/repositories/WhatsAppSessionRepository";
import { AppError } from "@/utils/AppError";
import { Logger } from "@/utils/logger";

export class MetaProviderService implements IWhatsAppProvider {
  /**
   * Send outbound message via Meta Cloud API
   */
  async sendMessage(
    sessionId: string,
    to: string,
    content: string | Record<string, unknown>,
    options?: Record<string, unknown>,
  ): Promise<unknown> {
    // 1. Resolve session credentials using Repository (No direct ORM leakage)
    const sessionRepository = new WhatsAppSessionRepository();
    const session = await sessionRepository.findSystemSession(sessionId);

    if (!session || !session.metaAccessToken || !session.metaPhoneNumberId) {
      throw new AppError("Las credenciales de Meta no están configuradas para esta sesión", 400);
    }

    const { metaAccessToken, metaPhoneNumberId } = session;

    // 2. Clean recipient phone number (remove @s.whatsapp.net etc.)
    const cleanPhone = to.split("@")[0].replace(/\D/g, "");

    // 3. Format Meta payload
    let payload: Record<string, unknown> = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: cleanPhone,
    };

    if (typeof content === "string") {
      payload.type = "text";
      payload.text = { body: content };
    } else if (content && typeof content === "object") {
      // Direct raw pass-through if they pass a pre-formatted Meta payload
      if (content.messaging_product === "whatsapp") {
        payload = { ...content, to: cleanPhone };
      } else {
        // Fallback or generic structured mapping (e.g. templates)
        payload = { ...payload, ...content };
      }
    } else {
      throw new AppError("Formato de mensaje inválido para Meta API", 400);
    }

    // 4. Send request to Meta Cloud Graph API
    try {
      const url = `https://graph.facebook.com/v19.0/${metaPhoneNumberId}/messages`;
      const res = await axios.post(url, payload, {
        headers: {
          Authorization: `Bearer ${metaAccessToken}`,
          "Content-Type": "application/json",
        },
      });
      return res.data;
    } catch (err: unknown) {
      interface AxiosErrorLike {
        response?: {
          data?: {
            error?: {
              message?: string;
            };
          };
          status?: number;
        };
        message: string;
      }
      const errorResponse = (err as AxiosErrorLike)?.response?.data;
      const errorMsg = errorResponse?.error?.message || (err as Error).message;
      Logger.error(`[MetaProvider] Message send failed: ${errorMsg}`, {
        sessionId,
        recipient: cleanPhone,
        error: errorResponse || err,
      });
      throw new AppError(`Error de Meta API: ${errorMsg}`, (err as AxiosErrorLike)?.response?.status || 500);
    }
  }

  /**
   * Presence update is not supported officially by Meta Cloud API.
   * We skip/no-op gracefully.
   */
  async sendPresenceUpdate(
    sessionId: string,
    to: string,
    type: "composing" | "recording" | "paused",
  ): Promise<void> {
    // Meta official API does not support simulation of typing via general webhooks/outbound API.
    // Graceful no-op.
    Logger.debug(`[MetaProvider] sendPresenceUpdate no-op (presence not supported by Meta Cloud API)`);
    return Promise.resolve();
  }
}
