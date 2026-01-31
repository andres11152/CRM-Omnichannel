import { prisma } from "@/config/database";
import { Logger } from "@/utils/logger";

interface StartSessionParams {
  userId: string;
  companyId: string;
  socketId: string;
}

interface EndSessionParams {
  socketId: string;
}

export const agentSessionService = {
  /**
   * Starts a new agent session when socket connects
   */
  startSession: async ({ userId, companyId, socketId }: StartSessionParams) => {
    try {
      // 1. Force close any stale open sessions for this user (prevent "stuck online" bug)
      await prisma.agentSession.updateMany({
        where: {
          userId,
          disconnectedAt: null,
        },
        data: {
          disconnectedAt: new Date(),
          // We can't easily calc duration in updateMany without raw SQL,
          // but closing them is priority to stop the timer.
        },
      });

      const session = await prisma.agentSession.create({
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
  endSession: async ({ socketId }: EndSessionParams) => {
    try {
      // Find the active session for this socket
      // We look for one that is NOT already disconnected, ideally.
      // But filtering by socketId should be enough if unique per connection.
      const activeSession = await prisma.agentSession.findFirst({
        where: {
          socketId,
          disconnectedAt: null,
        },
      });

      if (!activeSession) {
        // Might happen on server restart or if session creation failed
        Logger.debug(
          `[AgentSession] No active session found for socket ${socketId} to end.`,
        );
        return null;
      }

      const now = new Date();
      const durationSeconds = Math.floor(
        (now.getTime() - activeSession.connectedAt.getTime()) / 1000,
      );

      const updatedSession = await prisma.agentSession.update({
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
    } catch (error) {
      Logger.error(
        `[AgentSession] Failed to end session for socket ${socketId}`,
        error,
      );
      return null;
    }
  },
};
