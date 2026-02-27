import { Logger } from "@/utils/logger";

interface FlowMediaResult {
  type: string;
  url: string;
  message?: string;
  mimetype?: string;
  filename?: string;
}

type FlowResult = string | FlowMediaResult;

/**
 * 🤖 FLOW RUNNER
 *
 * Single Responsibility: Executes the Flow Engine for incoming messages.
 * If a flow handles the message, sends responses back via WhatsApp.
 */
export class FlowRunner {
  /**
   * Processes an incoming message through the Flow Engine.
   * Returns true if a flow handled the message (skip AI).
   */
  async execute(
    contactId: string,
    text: string,
    conversationId: string,
    companyId: string,
    channelId: string,
    senderId: string,
  ): Promise<boolean> {
    try {
      const { flowExecutor } = await import("../flowExecutor");

      const flowResults: FlowResult[] | null =
        await flowExecutor.processMessage(
          contactId,
          text,
          conversationId,
          companyId,
        );

      if (!flowResults || flowResults.length === 0) {
        return false;
      }

      Logger.info(
        `[FlowRunner] 🤖 Flow Engine handled message. Sending ${flowResults.length} responses.`,
      );

      await this.sendFlowResponses(
        flowResults,
        channelId,
        companyId,
        conversationId,
        senderId,
      );

      return true;
    } catch (error) {
      Logger.error(`[FlowRunner] Flow Execution Failed`, error);
      return false;
    }
  }

  // ─── Private Helpers ───────────────────────────────────────────

  private async sendFlowResponses(
    results: FlowResult[],
    channelId: string,
    companyId: string,
    conversationId: string,
    senderId: string,
  ): Promise<void> {
    const { whatsappService } = await import("../../whatsapp");

    for (const result of results) {
      if (typeof result === "string") {
        await whatsappService.sendMessage(channelId, result, {
          companyId,
          conversationId,
          senderId,
        });
      } else if (result && typeof result === "object") {
        await whatsappService.sendMessage(channelId, result.message || "", {
          companyId,
          conversationId,
          senderId,
          media: {
            type: result.type as "image" | "video" | "audio" | "document",
            url: result.url,
            mimetype: this.inferMime(result.url, result.type),
            filename: result.filename,
          },
        });
      }

      // Small delay to ensure order in WhatsApp
      await new Promise((r) => setTimeout(r, 300));
    }
  }

  private inferMime(_url: string, type: string): string {
    if (type === "image") return "image/jpeg";
    if (type === "video") return "video/mp4";
    if (type === "audio") return "audio/mp4";
    if (type === "document") return "application/pdf";
    return "application/octet-stream";
  }
}

export const flowRunner = new FlowRunner();
