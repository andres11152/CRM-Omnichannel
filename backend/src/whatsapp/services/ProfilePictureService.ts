import { prisma } from "@/config/database";
import { ISessionManager } from "../core/interfaces/ISessionManager";
import { Logger } from "@/utils/logger";

/**
 * 📸 PROFILE PICTURE SERVICE
 *
 * Handles fetching and persisting WhatsApp profile pictures.
 * Extracted from MessageHandler for SRP compliance.
 */
export class ProfilePictureService {
  constructor(private sessionManager: ISessionManager) {}

  /**
   * Fetch profile picture from WhatsApp and persist URL to the user record.
   * Skips fetch if user already has a valid HTTP profile picture URL.
   * Uses "image" quality first, falls back to "preview" quality.
   *
   * This is a fire-and-forget operation — errors are logged but never thrown.
   */
  async fetchAndPersist(
    sessionId: string,
    jid: string,
    userId: string,
  ): Promise<void> {
    try {
      const sock = this.sessionManager.getSession(sessionId);
      if (!sock) {
        Logger.warn(`[ProfilePic] No socket for session ${sessionId}`);
        return;
      }

      const normalizedJid = jid.includes("@") ? jid : `${jid}@s.whatsapp.net`;

      const existingUser = await prisma.user.findUnique({
        where: { id: userId },
        select: { profilePicUrl: true },
      });

      if (
        existingUser?.profilePicUrl &&
        existingUser.profilePicUrl.startsWith("http")
      ) {
        return;
      }

      let profilePicUrl: string | undefined;

      try {
        profilePicUrl = await sock.profilePictureUrl(normalizedJid, "image");
      } catch {
        try {
          profilePicUrl = await sock.profilePictureUrl(
            normalizedJid,
            "preview",
          );
        } catch {
          Logger.info(
            `[ProfilePic] No profile picture available for ${normalizedJid}`,
          );
          return;
        }
      }

      if (!profilePicUrl) return;

      await prisma.user.update({
        where: { id: userId },
        data: { profilePicUrl },
      });

      Logger.info(
        `[ProfilePic] ✅ Saved profile picture for user ${userId}: ${profilePicUrl.slice(0, 60)}...`,
      );
    } catch (error) {
      Logger.warn(`[ProfilePic] Failed to fetch/save profile pic:`, error);
    }
  }
}
