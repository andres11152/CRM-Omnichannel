import { companyRepository } from "@/repositories/CompanyRepository";
import { queueRepository } from "@/repositories/QueueRepository";
import { Logger } from "@/utils/logger";

/**
 * ️ ROUTING CONFIGURATION SERVICE
 * Manages conversation routing rules and AI auto-assignment settings
 *
 * Configuration is stored in Company.settings JSON field:
 * {
 *   conversationRouting: {
 *     enabled: boolean,
 *     defaultQueueId: string | null,
 *     aiAutoResponse: boolean,
 *     rules: Array<{
 *       channel: 'WHATSAPP' | 'EMAIL' | 'SMS',
 *       queueId: string,
 *       priority: number
 *     }>
 *   }
 * }
 */

export interface RoutingRule {
  channel: "WHATSAPP" | "EMAIL" | "SMS" | "ALL";
  queueId: string;
  priority: number; // Lower number = higher || priority
}

export interface RoutingConfig {
  enabled: boolean;
  defaultQueueId: string | null;
  aiAutoResponse: boolean;
  rules: RoutingRule[];
}

const DEFAULT_CONFIG: RoutingConfig = {
  enabled: true,
  defaultQueueId: null,
  aiAutoResponse: true,
  rules: [],
};

export class RoutingConfigService {
  /**
   * Get routing configuration for a company
   */
  async getConfig(companyId: string): Promise<RoutingConfig> {
    try {
      const company = await companyRepository.findUnique({
        where: { id: companyId },
        select: { settings: true },
      });

      if (!company?.settings) {
        Logger.info(
          `[RoutingConfig] No settings found for company ${companyId}, using defaults`,
        );
        return DEFAULT_CONFIG;
      }

      const settings = company.settings as Record<string, unknown>;
      const routingConfig = (settings.conversationRouting ||
        DEFAULT_CONFIG) as Record<string, unknown>;

      // Validate config structure
      return {
        enabled: (routingConfig.enabled as boolean) ?? true,
        defaultQueueId: (routingConfig.defaultQueueId as string | null) ?? null,
        aiAutoResponse: (routingConfig.aiAutoResponse as boolean) ?? true,
        rules: Array.isArray(routingConfig.rules) ? routingConfig.rules : [],
      };
    } catch (error) {
      Logger.error(
        `[RoutingConfig] Error getting config for ${companyId}:`,
        error,
      );
      return DEFAULT_CONFIG;
    }
  }

  /**
   * Update routing configuration for a company
   */
  async updateConfig(
    companyId: string,
    config: Partial<RoutingConfig>,
  ): Promise<void> {
    try {
      const currentSettings = await companyRepository.findUnique({
        where: { id: companyId },
        select: { settings: true },
      });

      const settings =
        (currentSettings?.settings as Record<string, unknown>) || {};

      settings.conversationRouting = {
        ...DEFAULT_CONFIG,
        ...((settings.conversationRouting || {}) as Record<string, unknown>),
        ...config,
      };

      await companyRepository.update(companyId, { settings });

      Logger.info(`[RoutingConfig]  Updated config for company ${companyId}`);
    } catch (error) {
      Logger.error(`[RoutingConfig] Error updating config:`, error);
      throw error;
    }
  }

  /**
   * Find the best queue for a conversation based on routing rules
   */
  async findBestQueue(
    companyId: string,
    channel: "WHATSAPP" | "EMAIL" | "SMS",
    preferAI: boolean = true,
  ): Promise<string | null> {
    try {
      const config = await this.getConfig(companyId);

      if (!config.enabled) {
        Logger.info(
          `[RoutingConfig] Routing disabled for company ${companyId}`,
        );
        return null;
      }

      // 1. Try channel-specific rules first
      const applicableRules = config.rules
        .filter((rule) => rule.channel === channel || rule.channel === "ALL")
        .sort((a, b) => a.priority - b.priority);

      for (const rule of applicableRules) {
        // Validate queue exists and is active
        const queue = await queueRepository.findFirst({
          where: {
            id: rule.queueId,
            companyId,
            isActive: true,
          },
          include: {
            aiAssistant: true,
          },
        });

        if (queue) {
          // If preferring AI, check if this queue has AI
          if (preferAI && config.aiAutoResponse) {
            if ((queue as unknown as { aiAssistant: unknown }).aiAssistant) {
              Logger.info(
                `[RoutingConfig]  Matched rule: Queue "${queue.name}" (has AI)`,
              );
              return queue.id;
            }
            // Skip this queue if it doesn't have AI and we prefer AI
            continue;
          } else {
            Logger.info(
              `[RoutingConfig]  Matched rule: Queue "${queue.name}"`,
            );
            return queue.id;
          }
        }
      }

      // 2. Try default queue
      if (config.defaultQueueId) {
        const defaultQueue = await queueRepository.findFirst({
          where: {
            id: config.defaultQueueId,
            companyId,
            isActive: true,
          },
        });

        if (defaultQueue) {
          Logger.info(
            `[RoutingConfig] Using default queue: "${defaultQueue.name}"`,
          );
          return defaultQueue.id;
        }
      }

      // 3. Fallback: Find any active queue (prefer with AI if enabled)
      if (preferAI && config.aiAutoResponse) {
        const aiQueue = await queueRepository.findFirst({
          where: {
            companyId,
            isActive: true,
            aiAssistant: {
              isNot: null,
            },
          },
          orderBy: { createdAt: "asc" },
        });

        if (aiQueue) {
          Logger.info(
            `[RoutingConfig] Fallback to first AI queue: "${aiQueue.name}"`,
          );
          return aiQueue.id;
        }
      }

      // 4. Ultimate fallback: First active || queue
      const anyQueue = await queueRepository.findFirst({
        where: {
          companyId,
          isActive: true,
        },
        orderBy: { createdAt: "asc" },
      });

      if (anyQueue) {
        Logger.info(`[RoutingConfig] Ultimate fallback: "${anyQueue.name}"`);
        return anyQueue.id;
      }

      Logger.warn(
        `[RoutingConfig] No suitable queue found for company ${companyId}`,
      );
      return null;
    } catch (error) {
      Logger.error(`[RoutingConfig] Error finding queue:`, error);
      return null;
    }
  }

  /**
   * Check if AI auto-response is enabled for a company
   */
  async isAIAutoResponseEnabled(companyId: string): Promise<boolean> {
    const config = await this.getConfig(companyId);
    return config.enabled && config.aiAutoResponse;
  }
}

export const routingConfigService = new RoutingConfigService();
