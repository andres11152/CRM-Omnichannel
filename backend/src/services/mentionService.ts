import { userRepository } from "@/repositories/UserRepository";
import { notificationRepository } from "@/repositories/NotificationRepository";
import { Logger } from "@/utils/logger";

/**
 * 💬 MENTION SERVICE
 * Detección y procesamiento de @menciones en notas internas
 * Diseñado para ser robusto y tolerante a fallos
 */

interface MentionDetectionResult {
  mentionedUserIds: string[];
  mentionedUsernames: string[];
  processedText: string; // Texto con menciones validadas
}

export const mentionService = {
  /**
   * Detecta menciones @username en un texto
   * Regex Pattern: @username (alphanumeric + underscores, no espacios)
   * Ejemplo: "@juan_perez @maria @admin123"
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

      // Validaciones de seguridad:
      // 1. No vacío
      // 2. Longitud razonable (3-50 chars)
      // 3. No es un dominio de email
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
   * Resuelve usernames a User IDs
   * Busca por: name (case-insensitive) o email prefix
   * TOLERANTE A FALLOS: Si un username no existe, lo ignora (no falla toda la operación)
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
      // Buscar usuarios en la base de datos
      // Estrategia: Buscar por nombre O por email (antes del @)
      const users = await userRepository.findMany({
        where: {
          companyId,
          OR: usernames.flatMap((username) => [
            // Match por nombre (case-insensitive)
            {
              name: {
                contains: username,
                mode: "insensitive",
              },
            },
            // Match por email prefix (juan.perez@company.com -> juan.perez)
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
        processedText: "", // Puede usarse para highlight en el futuro
      };
    } catch (error) {
      Logger.error("[MentionService] Error resolving usernames:", error);

      // FAULT TOLERANCE: Retornar vacío en vez de fallar
      return {
        mentionedUserIds: [],
        mentionedUsernames: [],
        processedText: "",
      };
    }
  },

  /**
   * Procesa un texto completo: detecta + resuelve menciones
   * ONE-STOP FUNCTION para el controller
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
   * Crea notificaciones para usuarios mencionados
   * Usa Socket.IO + (opcional) Push/Email
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
      // 1. Obtener info del creador (quien mencionó)
      const creator = await userRepository.findUnique({
        where: { id: createdByUserId },
        select: { name: true, email: true },
      });

      const creatorName = creator?.name || creator?.email || "Un usuario";

      // 2. Crear notificaciones persistentes en DB
      const notificationPromises = mentionedUserIds.map(async (userId) => {
        // Evitar notificarse a sí mismo
        if (userId === createdByUserId) return;

        const title = `${creatorName} te mencionó`;
        const message = `${creatorName} te mencionó en ${
          context.type === "note" ? "una nota" : "un comentario"
        }${context.contactName ? ` sobre ${context.contactName}` : ""}`;

        // Crear notificación en DB (🛡️ 100-YEAR FIX: Include companyId and strict metadata typing)
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

      // 3. Emitir evento Socket.IO (real-time)
      const { emitMentionNotification } =
        await import("@/services/socketEmitter");

      for (const userId of mentionedUserIds) {
        // Evitar notificarse a sí mismo
        if (userId === createdByUserId) continue;

        const notificationData = {
          type: "mention",
          title: `${creatorName} te mencionó`,
          message: `${creatorName} te mencionó en ${
            context.type === "note" ? "una nota" : "un comentario"
          }${context.contactName ? ` sobre ${context.contactName}` : ""}`,
          activityId,
          createdBy: creatorName,
          timestamp: new Date().toISOString(),
        };

        // Emitir a la sala del usuario específico
        emitMentionNotification(userId, notificationData);
      }

      Logger.info(
        `[MentionService] Notified ${mentionedUserIds.length} users about mention in activity ${activityId}`,
      );
    } catch (error) {
      // FAULT TOLERANCE: Log error pero no fallar la operación principal
      Logger.error("[MentionService] Error sending notifications:", error);
    }
  },
};
