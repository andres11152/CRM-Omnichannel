import axios from "axios";
import { instagramSessionRepository } from "@/instagram/InstagramSessionRepository";
import { AppError } from "@/utils/AppError";
import { Logger } from "@/utils/logger";

export interface InstagramMediaContent {
  type: "image" | "video" | "audio" | "file";
  url: string;
}

const IG_API_VERSION = "v19.0";

export class InstagramProviderService {
  /**
   * Send an outbound DM via the Instagram Messaging API (Graph API).
   * @param igBusinessAccountId The sender's Instagram-Scoped Business Account ID (session identifier)
   * @param igsid The recipient's Instagram-Scoped ID
   * @param content Text body or a media payload ({ type, url })
   */
  async sendMessage(
    igBusinessAccountId: string,
    igsid: string,
    content: string | InstagramMediaContent,
  ): Promise<{ messageId: string }> {
    const session = await instagramSessionRepository.findActiveSessionByIgAccountId(igBusinessAccountId);

    if (!session || !session.accessToken) {
      throw new AppError("Las credenciales de Instagram no están configuradas para esta sesión", 400);
    }

    const message =
      typeof content === "string"
        ? { text: content }
        : { attachment: { type: content.type, payload: { url: content.url } } };

    try {
      const url = `https://graph.facebook.com/${IG_API_VERSION}/${igBusinessAccountId}/messages`;
      const res = await axios.post(
        url,
        {
          recipient: { id: igsid },
          message,
        },
        {
          headers: {
            Authorization: `Bearer ${session.accessToken}`,
            "Content-Type": "application/json",
          },
        },
      );
      return { messageId: res.data?.message_id || res.data?.id };
    } catch (err: unknown) {
      interface AxiosErrorLike {
        response?: { data?: { error?: { message?: string } }; status?: number };
        message: string;
      }
      const errorResponse = (err as AxiosErrorLike)?.response?.data;
      const errorMsg = errorResponse?.error?.message || (err as Error).message;
      Logger.error(`[InstagramProvider] Message send failed: ${errorMsg}`, {
        igBusinessAccountId,
        recipient: igsid,
        error: errorResponse || err,
      });
      throw new AppError(`Error de Instagram API: ${errorMsg}`, (err as AxiosErrorLike)?.response?.status || 500);
    }
  }

  /**
   * Best-effort profile lookup for a DM sender (name/username), used to give
   * the shadow Contact/User a real display name instead of the bare IGSID.
   */
  async getUserProfile(igBusinessAccountId: string, igsid: string): Promise<{ name?: string; username?: string }> {
    try {
      const session = await instagramSessionRepository.findActiveSessionByIgAccountId(igBusinessAccountId);
      if (!session?.accessToken) return {};

      const url = `https://graph.facebook.com/${IG_API_VERSION}/${igsid}`;
      const res = await axios.get(url, {
        params: { fields: "name,username", access_token: session.accessToken },
      });
      return { name: res.data?.name, username: res.data?.username };
    } catch (err: unknown) {
      Logger.warn(`[InstagramProvider] Profile lookup failed for ${igsid}`, { error: err });
      return {};
    }
  }
}

export const instagramProviderService = new InstagramProviderService();
