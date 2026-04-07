import { agentSessionRepository } from "@/repositories/AgentSessionRepository";
import { Logger } from "@/utils/logger";
import TenantContextManager from "@/config/tenantContext";

interface StartSessionParams {
  userId: string;
  companyId: string;
  socketId: string;
}

interface EndSessionParams {
  socketId: string;
  userId?: string;
  companyId?: string;
}

export const agentSessionService = {
  /**
   * Starts a new agent session when socket connects
   */
  startSession: async ({ userId, companyId, socketId }: StartSessionParams) => {
    try {
      return await TenantContextManager.run({ companyId, userId }, async () => {
        // 1. Force close any stale open sessions for this user (prevent "stuck online" bug)
        await agentSessionRepository.updateMany({
          where: {
            userId,
            disconnectedAt: null,
          },
          data: {
            disconnectedAt: new Date(),
          },
        });

        const session = await agentSessionRepository.create({
          data: {
            userId,
            companyId,
            socketId,
            connectedAt: new Date(),
            disconnectedAt: null,
          },
        });
        Logger.debug(
          `[AgentSession] Started session ${session.id} for user ${userId}`,
        );
        return session;
      });
    } catch (error) {
      Logger.error(
        `[AgentSession] Failed to start session for user ${userId}`,
        error,
      );
      return null;
    }
  },

  /**
   * Ends a session when socket disconnects.
   * Calculates duration.
   */
  endSession: async ({ socketId, userId, companyId }: EndSessionParams) => {
    try {
      const effectiveCompanyId = companyId || "__SYSTEM__";
      const effectiveUserId = userId || "system-socket-closer";

      return await TenantContextManager.run({ companyId: effectiveCompanyId, userId: effectiveUserId }, async () => {
        const activeSession = await agentSessionRepository.findFirst({
          where: {
            socketId,
            disconnectedAt: null,
          },
        });

        if (!activeSession) {
          Logger.debug(
            `[AgentSession] No active session found for socket ${socketId} to end.`,
          );
          return null;
        }

        const now = new Date();
        const durationSeconds = Math.floor(
          (now.getTime() - activeSession.connectedAt.getTime()) / 1000,
        );

        const updatedSession = await agentSessionRepository.update({
          where: { id: activeSession.id },
          data: {
            disconnectedAt: now,
            duration: durationSeconds,
          },
        });

        Logger.debug(
          `[AgentSession] Ended session ${updatedSession.id}. Duration: ${durationSeconds}s`,
        );
        return updatedSession;
      });
    } catch (error) {
      Logger.error(
        `[AgentSession] Failed to end session for socket ${socketId}`,
        error,
      );
      return null;
    }
  },
};
