import { prisma } from "@/config/database";

/**
 * 🎛️ ROUTING CONFIGURATION SERVICE
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
  priority: number; // Lower number = higher priority
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
      const company = await prisma.company.findUnique({
        where: { id: companyId },
        select: { settings: true },
      });

      if (!company?.settings) {
        console.log(
          `[RoutingConfig] No settings found for company ${companyId}, using defaults`
        );
        return DEFAULT_CONFIG;
      }

      const settings = company.settings as any;
      const routingConfig = settings.conversationRouting || DEFAULT_CONFIG;

      // Validate config structure
      return {
        enabled: routingConfig.enabled ?? true,
        defaultQueueId: routingConfig.defaultQueueId ?? null,
        aiAutoResponse: routingConfig.aiAutoResponse ?? true,
        rules: Array.isArray(routingConfig.rules) ? routingConfig.rules : [],
      };
    } catch (error) {
      console.error(
        `[RoutingConfig] Error getting config for ${companyId}:`,
        error
      );
      return DEFAULT_CONFIG;
    }
  }

  /**
   * Update routing configuration for a company
   */
  async updateConfig(
    companyId: string,
    config: Partial<RoutingConfig>
  ): Promise<void> {
    try {
      const currentSettings = await prisma.company.findUnique({
        where: { id: companyId },
        select: { settings: true },
      });

      const settings = (currentSettings?.settings as any) || {};

      settings.conversationRouting = {
        ...DEFAULT_CONFIG,
        ...(settings.conversationRouting || {}),
        ...config,
      };

      await prisma.company.update({
        where: { id: companyId },
        data: { settings },
      });

      console.log(`[RoutingConfig] ✓ Updated config for company ${companyId}`);
    } catch (error) {
      console.error(`[RoutingConfig] Error updating config:`, error);
      throw error;
    }
  }

  /**
   * Find the best queue for a conversation based on routing rules
   * @param companyId - Company ID
   * @param channel - Communication channel
   * @param preferAI - Prefer queues with AI assistants
   * @returns Queue ID or null
   */
  async findBestQueue(
    companyId: string,
    channel: "WHATSAPP" | "EMAIL" | "SMS",
    preferAI: boolean = true
  ): Promise<string | null> {
    try {
      const config = await this.getConfig(companyId);

      if (!config.enabled) {
        console.log(
          `[RoutingConfig] Routing disabled for company ${companyId}`
        );
        return null;
      }

      // 1. Try channel-specific rules first
      const applicableRules = config.rules
        .filter((rule) => rule.channel === channel || rule.channel === "ALL")
        .sort((a, b) => a.priority - b.priority);

      for (const rule of applicableRules) {
        // Validate que exists and is active
        const queue = await prisma.queue.findFirst({
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
            if (queue.aiAssistant) {
              console.log(
                `[RoutingConfig] ✓ Matched rule: Queue "${queue.name}" (has AI)`
              );
              return queue.id;
            }
            // Skip this queue if it doesn't have AI and we prefer AI
            continue;
          } else {
            console.log(
              `[RoutingConfig] ✓ Matched rule: Queue "${queue.name}"`
            );
            return queue.id;
          }
        }
      }

      // 2. Try default queue
      if (config.defaultQueueId) {
        const defaultQueue = await prisma.queue.findFirst({
          where: {
            id: config.defaultQueueId,
            companyId,
            isActive: true,
          },
        });

        if (defaultQueue) {
          console.log(
            `[RoutingConfig] Using default queue: "${defaultQueue.name}"`
          );
          return defaultQueue.id;
        }
      }

      // 3. Fallback: Find any active queue (prefer with AI if enabled)
      if (preferAI && config.aiAutoResponse) {
        const aiQueue = await prisma.queue.findFirst({
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
          console.log(
            `[RoutingConfig] Fallback to first AI queue: "${aiQueue.name}"`
          );
          return aiQueue.id;
        }
      }

      // 4. Ultimate fallback: First active queue
      const anyQueue = await prisma.queue.findFirst({
        where: {
          companyId,
          isActive: true,
        },
        orderBy: { createdAt: "asc" },
      });

      if (anyQueue) {
        console.log(`[RoutingConfig] Ultimate fallback: "${anyQueue.name}"`);
        return anyQueue.id;
      }

      console.warn(
        `[RoutingConfig] No suitable queue found for company ${companyId}`
      );
      return null;
    } catch (error) {
      console.error(`[RoutingConfig] Error finding queue:`, error);
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
