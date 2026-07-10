import { Logger } from "@/utils/logger";
import { WhatsAppIdUtils } from "@/whatsapp/utils/WhatsAppIdUtils";

/**
 * [ENTERPRISE] Rate-limited, background scheduler for on-demand WhatsApp
 * profile-picture healing.
 *
 * ProfilePictureService.fetchAndPersist is only ever invoked from two places:
 * a live inbound message (InboundOrchestratorService) or opening a single
 * conversation's full detail (ConversationQueryService). Contacts imported via
 * history sync — the majority of any real inbox — never trigger either path,
 * so their avatar stays blank in the ticket LIST until an agent happens to
 * open that exact chat. This scheduler lets list endpoints (My Inbox, Queue,
 * History) opportunistically heal missing photos for the page being viewed,
 * without hammering WhatsApp: each target is capped by a per-user cooldown
 * and each batch is capped in size and processed serially on the one socket.
 */
class ProfilePicHealScheduler {
  private lastAttempt = new Map<string, number>();
  private static readonly COOLDOWN_MS = 30 * 60 * 1000; // 30 min — matches ChatSyncIngest's context-sync cooldown pattern
  private static readonly MAX_PER_BATCH = 8;

  scheduleBulk(
    companyId: string,
    targets: Array<{ userId: string; channelId: string }>,
  ): void {
    if (targets.length === 0) return;

    const now = Date.now();
    const due = targets
      .filter((t) => t.userId && t.userId !== "missing-user" && t.channelId)
      .filter((t) => {
        const key = `${companyId}:${t.userId}`;
        const last = this.lastAttempt.get(key);
        return !last || now - last >= ProfilePicHealScheduler.COOLDOWN_MS;
      })
      .slice(0, ProfilePicHealScheduler.MAX_PER_BATCH);

    if (due.length === 0) return;

    for (const t of due) {
      this.lastAttempt.set(`${companyId}:${t.userId}`, now);
    }

    // Fire-and-forget: resolve the active session once, then heal each target
    // SERIALLY (not Promise.all) so a page of 8 contacts doesn't burst 8
    // concurrent profile-picture IQ requests on the single WhatsApp socket.
    import("@/whatsapp")
      .then(({ whatsappService }) =>
        whatsappService
          .getSessionManager()
          .findActiveSessionForCompany(companyId)
          .then(async (session) => {
            if (!session) return;
            const { ProfilePictureService } = await import(
              "@/whatsapp/services/ProfilePictureService"
            );
            const profilePicService = new ProfilePictureService(
              whatsappService.getSessionManager(),
            );
            for (const t of due) {
              const jid = WhatsAppIdUtils.getTargetJid(t.channelId);
              await profilePicService
                .fetchAndPersist(session.sessionId, jid, t.userId, companyId)
                .catch((err: Error) =>
                  Logger.warn(
                    `[ProfilePicHeal] Bulk heal failed for ${t.channelId}:`,
                    { error: err.message },
                  ),
                );
            }
          }),
      )
      .catch((err) =>
        Logger.warn(`[ProfilePicHeal] Bulk heal scheduling failed:`, err),
      );
  }
}

export const profilePicHealScheduler = new ProfilePicHealScheduler();
