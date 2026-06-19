import { flowSessionRepository } from "@/repositories/FlowSessionRepository";
import { Logger } from "@/utils/logger";
import { FlowSessionState, KeywordTriggerData } from "@/types/flow.types";
import { FlowNavigationService } from "./FlowNavigationService";

const TRIGGER_RATE_LIMIT_MS = 3000;
const triggerTimestamps = new Map<string, number>();

export class FlowTriggerService {
  constructor(private navigationService: FlowNavigationService) {}

  async checkTriggers(
    contactId: string,
    message: string,
    companyId: string,
    conversationId: string,
    activeFlowId?: string,
  ): Promise<FlowSessionState | null> {
    // A1: Per-contact rate limiting to prevent trigger spam
    const now = Date.now();
    const lastTrigger = triggerTimestamps.get(contactId) ?? 0;
    if (now - lastTrigger < TRIGGER_RATE_LIMIT_MS) {
      Logger.warn(`[FlowTrigger] Rate limit hit for contact ${contactId}. Skipping trigger check.`);
      return null;
    }

    const flows = await flowSessionRepository.findActiveWorkflowsByTrigger(
      companyId,
      "KEYWORD",
    );

    const messageLower = message.toLowerCase().trim();

    for (const flow of flows) {
      if (activeFlowId && flow.id === activeFlowId) {
        continue;
      }

      const triggerData =
        flow.triggerConfig as unknown as KeywordTriggerData | null;

      const safeData = (triggerData || {}) as Record<string, unknown>;

      let rawKeywords: unknown =
        safeData.keywords ||
        safeData.keyword ||
        safeData.words ||
        safeData.phrases ||
        [];

      if (typeof rawKeywords === "string") {
        rawKeywords = [rawKeywords];
      }

      const keywords: string[] = [];

      if (Array.isArray(rawKeywords)) {
        for (const k of rawKeywords) {
          if (typeof k === "string") {
            const parts = k
              .split(",")
              .map((s) => s.trim().toLowerCase())
              .filter((s) => s.length > 0);
            keywords.push(...parts);
          }
        }
      }

      for (const keyword of keywords) {
        if (messageLower.includes(keyword)) {
          Logger.info(
            `[FlowTrigger]  Trigger match! Keyword: "${keyword}" found in message. Starting flow ${flow.id}`,
          );
          triggerTimestamps.set(contactId, Date.now());
          return await this.navigationService.startNewSession(
            flow.id,
            contactId,
            companyId,
            conversationId,
          );
        }
      }
    }

    return null;
  }
}
