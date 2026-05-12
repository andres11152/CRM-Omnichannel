import { userRepository } from "@/repositories/UserRepository";
import { notificationRepository } from "@/repositories/NotificationRepository";
import { Logger } from "@/utils/logger";

/**
 * [CHAT] MENTION SERVICE
 * Detection and processing of @mentions in internal notes
 * Designed to be robust and fault-tolerant
 */

interface MentionDetectionResult {
  mentionedUserIds: string[];
  mentionedUsernames: string[];
  processedText: string; // Texto con menciones validadas
}

export const mentionService = {
  /**
   * Detects @username mentions in text
   * Regex Pattern: @username (alphanumeric + underscores, no spaces)
   * Example: "@john_doe @mary @admin123"
   */
  detectMentions(text: string): string[] {
    if (!text || typeof text !== "string") return [];

    // Pattern: @username (letters, numbers, underscores, dots)
    // Evita falsos positivos como emails (@gmail.com)
    const mentionRegex = /@([\w.]+)(?!\S)/g;
    const matches = text.matchAll(mentionRegex);

    const usernames = new Set<string>();
    for (const match of matches) {
      const username = match[1].toLowerCase().trim();

      // Safety validations:
      // 1. Not empty
      // 2. Reasonable length (3-50 chars)
      // 3. Not an email domain
      if (
        username &&
        username.length >= 3 &&
        username.length <= 50 &&
        !username.includes("gmail") &&
        !username.includes("hotmail") &&
        !username.includes("outlook")
      ) {
        usernames.add(username);
      }
    }

    return Array.from(usernames);
  },

  /**
   * Resolves usernames to User IDs
   * Search by: name (case-insensitive) or email prefix
   * FAULT TOLERANT: If a username doesn't exist, it ignores it.
   */
  async resolveUsernames(
    usernames: string[],
    companyId: string,
  ): Promise<MentionDetectionResult> {
    if (!usernames || usernames.length === 0) {
      return {
        mentionedUserIds: [],
        mentionedUsernames: [],
        processedText: "",
      };
    }

    try {
      // Search users in DB
      // Strategy: Search by name OR email (before @)
      const users = await userRepository.findMany({
        where: {
          companyId,
          OR: usernames.flatMap((username) => [
            // Match by name (case-insensitive)
            {
              name: {
                contains: username,
                mode: "insensitive",
              },
            },
            // Match by email prefix (john.doe@company.com -> john.doe)
            {
              email: {
                startsWith: username.toLowerCase(),
                mode: "insensitive",
              },
            },
          ]),
        },
        select: {
          id: true,
          name: true,
          email: true,
        },
        take: 20, // Safety limit para evitar queries gigantes
      });

      // Crear mapa de usernames a IDs
      const resolvedUserIds = users.map((u) => u.id);
      const resolvedUsernames = users.map((u) => u.name || u.email);

      Logger.info(
        `[MentionService] Resolved ${resolvedUserIds.length}/${usernames.length} mentions`,
      );

      return {
        mentionedUserIds: resolvedUserIds,
        mentionedUsernames: resolvedUsernames,
        processedText: "", // Can be used for highlighting in the future
      };
    } catch (error) {
      Logger.error("[MentionService] Error resolving usernames:", error);

      // FAULT TOLERANCE: Return empty instead of failing
      return {
        mentionedUserIds: [],
        mentionedUsernames: [],
        processedText: "",
      };
    }
  },

  /**
   * Processes full text: detect + resolve mentions
   * ONE-STOP FUNCTION for the controller
   */
  async processText(
    text: string,
    companyId: string,
  ): Promise<MentionDetectionResult> {
    const usernames = this.detectMentions(text);
    if (usernames.length === 0) {
      return {
        mentionedUserIds: [],
        mentionedUsernames: [],
        processedText: text,
      };
    }

    return await this.resolveUsernames(usernames, companyId);
  },

  /**
   * Creates notifications for mentioned users
   * Uses Socket.IO + (optional) Push/Email
   */
  async notifyMentionedUsers(
    mentionedUserIds: string[],
    activityId: string,
    createdByUserId: string,
    companyId: string,
    context: {
      type: string; // "note", "comment", etc.
      subject: string;
      contactName?: string;
    },
  ): Promise<void> {
    if (!mentionedUserIds || mentionedUserIds.length === 0) return;

    try {
      // 1. Get creator info (who mentioned)
      const creator = await userRepository.findFirst({
        where: { id: createdByUserId },
        select: { name: true, email: true },
      });

      const creatorName = creator?.name || creator?.email || "A user";

      // 2. Create persistent notifications in DB
      const notificationPromises = mentionedUserIds.map(async (userId) => {
        // Avoid self-notification
        if (userId === createdByUserId) return;

        const title = `${creatorName} mentioned you`;
        const message = `${creatorName} mentioned you in ${
          context.type === "note" ? "a note" : "a comment"
        }${context.contactName ? ` regarding ${context.contactName}` : ""}`;

        // Create DB notification
        await notificationRepository.create({
          data: {
            userId,
            companyId,
            type: "mention",
            title,
            message,
            link: `/activities/${activityId}`,
            read: false,
            metadata: {
              activityId,
              createdBy: creatorName,
              createdById: createdByUserId,
              context: context.type,
            },
          },
        });
      });

      await Promise.all(notificationPromises);

      // 3. Emit Socket.IO event (real-time)
      const { emitMentionNotification } =
        await import("@/services/SocketEmitter");

      for (const userId of mentionedUserIds) {
        // Avoid self-notification
        if (userId === createdByUserId) continue;

        const notificationData = {
          type: "mention",
          title: `${creatorName} mentioned you`,
          message: `${creatorName} mentioned you in ${
            context.type === "note" ? "a note" : "a comment"
          }${context.contactName ? ` regarding ${context.contactName}` : ""}`,
          activityId,
          createdBy: creatorName,
          timestamp: new Date().toISOString(),
        };

        // Emit to specific user room
        emitMentionNotification(userId, notificationData);
      }

      Logger.info(
        `[MentionService] Notified ${mentionedUserIds.length} users about mention in activity ${activityId}`,
      );
    } catch (error) {
      // FAULT TOLERANCE: Log error but don't fail main operation
      Logger.error("[MentionService] Error sending notifications:", error);
    }
  },
};
