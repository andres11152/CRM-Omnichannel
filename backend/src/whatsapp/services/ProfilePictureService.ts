import { ISessionManager } from "../core/interfaces/ISessionManager";
import { Logger } from "@/utils/logger";
import { z } from "zod";
import { TenantContextManager } from "@/config/tenantContext";
import { userRepository } from "@/repositories/UserRepository";
import { contactRepository } from "@/repositories/ContactRepository";
import axios from "axios";
import { storageService } from "@/services/StorageService";

const FetchProfilePicSchema = z.object({
  sessionId: z.string().min(1, "Session ID is required"),
  jid: z.string().min(1, "JID is required"),
  userId: z.string().min(1, "User ID is required"),
  companyId: z.string().min(1, "Company ID is required"),
});

/**
 *  PROFILE PICTURE SERVICE
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
    sessionIdParam: string,
    jidParam: string,
    userIdParam: string,
    companyIdParam: string,
  ): Promise<void> {
    try {
      // [SEC] Fail-Safe Validation: strictly validate incoming parameters
      const { sessionId, jid, userId, companyId } = FetchProfilePicSchema.parse(
        {
          sessionId: sessionIdParam,
          jid: jidParam,
          userId: userIdParam,
          companyId: companyIdParam,
        },
      );

      // [SEC] Multi-tenant Scope: Ensure code execution is contextualized
      await TenantContextManager.run(
        { companyId, userId: "system", requestId: `profile-pic:${userId}` },
        async () => {
          const sock = this.sessionManager.getSession(sessionId);
          if (!sock) {
            Logger.warn(
              `[ProfilePic] No socket for session ${sessionId} - CompanyId: ${companyId}`,
            );
            return;
          }

          const normalizedJid = jid.includes("@")
            ? jid
            : `${jid}@s.whatsapp.net`;

          const existingUser = await userRepository.findFirst({
            where: { id: userId, companyId },
            select: {
              profilePicUrl: true,
              phone: true,
              companyId: true,
              role: true,
            },
          });

          if (
            existingUser?.profilePicUrl &&
            (existingUser.profilePicUrl.includes("amazonaws.com") ||
              existingUser.profilePicUrl.includes("storage.googleapis.com") ||
              !existingUser.profilePicUrl.includes("pps.whatsapp.net"))
          ) {
            return;
          }

          // [BAILEYS 7] LID-ADDRESSED CONTACTS: tctoken is stored under the LID JID.
          // When we call profilePictureUrl with a PN JID, Baileys must resolve it to
          // the LID via getLIDForPN (USYNC query). If that USYNC fails (cache miss
          // post-restart, rate limit), the tctoken lookup falls back to the PN key
          // where nothing is stored, and WhatsApp rejects the request without a token.
          // Fix: try the PN JID first, then retry with the LID JID from the store.
          const PP_TIMEOUT = 15_000;

          const tryFetch = async (targetJid: string): Promise<string | undefined> => {
            try {
              return await sock.profilePictureUrl(targetJid, "image", PP_TIMEOUT);
            } catch {
              try {
                return await sock.profilePictureUrl(targetJid, "preview", PP_TIMEOUT);
              } catch {
                return undefined;
              }
            }
          };

          let profilePicUrl = await tryFetch(normalizedJid);

          if (!profilePicUrl && !normalizedJid.includes("@lid")) {
            // Fallback: look up LID JID from the in-memory store and retry with it
            // so Baileys can find the tctoken that was stored under the LID key.
            const contactInfo = this.sessionManager.getContactInfo(sessionId, normalizedJid);
            const lidJid = contactInfo?.lid;
            if (lidJid) {
              Logger.info(`[ProfilePic] Retrying with LID JID ${lidJid} for ${normalizedJid}`);
              profilePicUrl = await tryFetch(lidJid);
            }
          }

          if (!profilePicUrl) {
            Logger.info(
              `[ProfilePic] No profile picture available for ${normalizedJid} - CompanyId: ${companyId}`,
            );
            return;
          }

          if (!profilePicUrl) return;

          // [SEC] 100-YEAR FIX: Download and persist the image to avoid 403 errors (PPS links expire)
          try {
            const response = await axios.get(profilePicUrl, {
              responseType: "arraybuffer",
            });
            const buffer = Buffer.from(response.data);
            const mimeType = response.headers["content-type"] || "image/jpeg";
            const filename = `profile_${userId}_${Date.now()}.jpg`;

            const uploadResult = await storageService.uploadFile(
              companyId,
              buffer,
              filename,
              mimeType,
            );
            profilePicUrl = uploadResult.url;

            Logger.info(
              `[ProfilePic] [PKG] Persisted profile picture for ${userId} to storage: ${profilePicUrl}`,
            );
          } catch (uploadErr) {
            Logger.warn(
              `[ProfilePic] Failed to persist image to storage, using original URL:`,
              uploadErr,
            );
          }

          await userRepository.update(userId, companyId, { profilePicUrl });

          // Also update the associated CRM Contact if it exists
          if (existingUser?.phone) {
            await contactRepository.updateMany({
              where: {
                companyId,
                phone: existingUser.phone,
              },
              data: { profilePicUrl },
            });
          }

          Logger.info(
            `[ProfilePic] [OK] Saved profile picture for user & contact ${userId}: ${profilePicUrl.slice(0, 60)}... - CompanyId: ${companyId}`,
          );

          // Push real-time update so the frontend refreshes the avatar without a reload
          try {
            const { gateway } = await import("@/gateways/socketGateway");
            gateway.emitToCompany(companyId, "contact.updated", {
              id: userId,
              profilePicUrl,
              phone: existingUser?.phone || null,
            });
          } catch {
            // Non-blocking — socket may not be ready
          }
        },
      );
    } catch (error) {
      // [SEC] 100-YEAR FIX: Centralized logging with full stack trace and context
      Logger.error(
        `[ProfilePic] Failed to fetch/save profile pic for user ${userIdParam} in company ${companyIdParam}. SessionId: ${sessionIdParam}:`,
        error instanceof Error ? error.stack || error.message : error,
      );
    }
  }
}
