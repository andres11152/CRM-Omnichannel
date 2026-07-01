import axios from "axios";
import { IWhatsAppProvider } from "../core/interfaces/IWhatsAppProvider";
import redisClient from "@/config/redis";

const GATEWAY_URL = process.env.WHATSAPP_GATEWAY_URL || "http://localhost:3001";

export class BaileysProviderService implements IWhatsAppProvider {
  private readonly sessionPodCache = new Map<string, { url: string; expiresAt: number }>();

  private async getGatewayUrlForSession(sessionId: string): Promise<string> {
    const cached = this.sessionPodCache.get(sessionId);
    if (cached && cached.expiresAt > Date.now()) return cached.url;

    try {
      if (redisClient?.isOpen) {
        const pod = await Promise.race<string | null>([
          redisClient.get(`wa:session-route:${sessionId}`),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 50)),
        ]);
        if (pod) {
          this.sessionPodCache.set(sessionId, { url: pod, expiresAt: Date.now() + 30_000 });
          return pod;
        }
      }
    } catch {
      // Fall through to default
    }
    return GATEWAY_URL;
  }

  async sendMessage(
    sessionId: string,
    to: string,
    content: string | Record<string, unknown>,
    options?: Record<string, unknown>,
  ): Promise<unknown> {
    const baseUrl = await this.getGatewayUrlForSession(sessionId);
    const toJid = to.includes("@") ? to : `${to}@s.whatsapp.net`;
    const res = await axios.post(`${baseUrl}/sessions/${sessionId}/messages/send`, {
      toJid,
      messageContent: content,
      options,
    });
    return res.data;
  }

  async sendPresenceUpdate(
    sessionId: string,
    to: string,
    type: "composing" | "recording" | "paused",
  ): Promise<void> {
    const baseUrl = await this.getGatewayUrlForSession(sessionId);
    const toJid = to.includes("@") ? to : `${to}@s.whatsapp.net`;
    await axios.post(`${baseUrl}/sessions/${sessionId}/presence`, {
      toJid,
      type,
    }).catch(() => {});
  }
}
