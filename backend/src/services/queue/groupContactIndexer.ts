import { Queue, Worker, Job } from "bullmq";
import { connection } from "@/config/bullmq";
import { contactRepository } from "@/repositories/ContactRepository";
import { conversationRepository } from "@/repositories/ConversationRepository";
import { contactService } from "@/services/contactService";
import { whatsappService } from "@/whatsapp";
import { WhatsAppIdUtils } from "@/whatsapp/utils/WhatsAppIdUtils";
import { Logger } from "@/utils/logger";

// ============================================================================
// 🏢 ENTERPRISE GROUP CONTACT INDEXER
//
// Async BullMQ worker that:
// 1. Registers group participants as lightweight contacts (phone + origin tag)
// 2. Enriches contacts progressively (pushName, profile pic) in background
// 3. Rate-limits sync to prevent Meta bans (10 groups/min)
// 4. Marks contacts with "source: whatsapp_group" for GDPR opt-in filtering
// ============================================================================

// ── Types ────────────────────────────────────────────────────────────────────

export interface GroupIndexJob {
  type: "INDEX_GROUP_PARTICIPANTS" | "ENRICH_CONTACT";
  companyId: string;
  groupJid: string;
  sessionId: string;
  groupName?: string;
  // For ENRICH_CONTACT jobs
  contactId?: string;
  contactPhone?: string;
  senderJid?: string;
}

// ── Queue ────────────────────────────────────────────────────────────────────

const QUEUE_NAME = "group-contact-indexer";

export const groupIndexQueue = new Queue<GroupIndexJob>(QUEUE_NAME, {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: { count: 500 },
    removeOnFail: { count: 200 },
  },
});

// ── Rate Limiter (in-memory, per-company) ────────────────────────────────────

const companyLastSync = new Map<string, number>();
const SYNC_COOLDOWN_MS = 6000; // 6 seconds between group syncs per company (10/min)

function canSyncGroup(companyId: string): boolean {
  const last = companyLastSync.get(companyId) || 0;
  if (Date.now() - last < SYNC_COOLDOWN_MS) return false;
  companyLastSync.set(companyId, Date.now());
  return true;
}

// ── Worker ───────────────────────────────────────────────────────────────────

let workerInstance: Worker<GroupIndexJob> | null = null;

async function processJob(job: Job<GroupIndexJob>): Promise<void> {
  const { type, companyId, groupJid, sessionId, groupName } = job.data;

  if (type === "INDEX_GROUP_PARTICIPANTS") {
    await indexGroupParticipants(companyId, groupJid, sessionId, groupName);
  } else if (type === "ENRICH_CONTACT") {
    await enrichContact(job.data);
  }
}

/**
 * INDEX_GROUP_PARTICIPANTS
 * Fetches all participants from a WhatsApp group and creates
 * lightweight CRM contacts for those not yet registered.
 */
async function indexGroupParticipants(
  companyId: string,
  groupJid: string,
  sessionId: string,
  groupName?: string,
): Promise<void> {
  // Rate limit check
  if (!canSyncGroup(companyId)) {
    Logger.debug(
      `[GroupIndexer] ⏳ Rate limited. Requeueing group ${groupJid} for company ${companyId}`,
    );
    // Re-add with delay
    await groupIndexQueue.add(
      "index-delayed",
      {
        type: "INDEX_GROUP_PARTICIPANTS",
        companyId,
        groupJid,
        sessionId,
        groupName,
      },
      { delay: SYNC_COOLDOWN_MS },
    );
    return;
  }

  const sock = whatsappService.getSocket(sessionId);
  if (!sock) {
    Logger.warn(`[GroupIndexer] No socket for session ${sessionId}`);
    return;
  }

  // 🛡️ ENTERPRISE: Check if synchronization is enabled for this specific group
  const conversation = await conversationRepository.findFirst({
    where: { companyId, channelId: groupJid.split("@")[0] },
    select: { id: true, syncEnabled: true },
  });

  if (conversation && !conversation.syncEnabled) {
    Logger.info(
      `[GroupIndexer] 🛑 Skipping group ${groupJid} (Sync is DISABLED by user)`,
    );
    return;
  }

  let metadata: { subject: string; participants: Array<{ id: string }> };
  try {
    metadata = await sock.groupMetadata(groupJid);
  } catch (error) {
    Logger.warn(
      `[GroupIndexer] Failed to fetch group metadata for ${groupJid}`,
      {
        error: (error as Error).message,
      },
    );
    return;
  }

  const resolvedGroupName = groupName || metadata.subject || "Grupo";
  const originTag = `Grupo: ${resolvedGroupName}`;

  // Get existing phones for fast lookup (avoid N+1)
  const existingContacts = await contactRepository.findMany({
    where: { companyId, deletedAt: null },
    select: { id: true, phone: true },
  });
  const existingPhones = new Set(
    existingContacts
      .filter((c) => c.phone)
      .map((c) => c.phone!.replace(/\D/g, "")),
  );

  let created = 0;
  let skipped = 0;
  let tagged = 0;

  for (const participant of metadata.participants) {
    const cleanJid = WhatsAppIdUtils.getCleanJid(participant.id);
    if (!cleanJid) continue;

    const phone = WhatsAppIdUtils.getPhoneNumber(cleanJid);
    if (!phone) {
      skipped++;
      continue;
    }

    // Skip if they are the business number
    const sessionPhone = sock.user?.id
      ? WhatsAppIdUtils.getPhoneNumber(
          WhatsAppIdUtils.getCleanJid(sock.user.id) || "",
        )
      : null;
    if (sessionPhone && phone === sessionPhone) continue;

    if (existingPhones.has(phone)) {
      // Contact exists — just add the group tag if missing
      const existing = existingContacts.find(
        (c) => c.phone?.replace(/\D/g, "") === phone,
      );
      if (existing) {
        try {
          // Use contactService.upsert to merge tags properly
          await contactService.upsert(companyId, {
            phone,
            tags: [originTag],
            customFields: {
              source: "whatsapp_group",
              isGroupContact: true,
              sourceGroups: [groupJid],
            },
          });
          tagged++;
        } catch {
          // Non-critical: tag merge failed
        }
      }
      continue;
    }

    // Create lightweight contact (Phase 1: just phone + tag)
    try {
      await contactService.upsert(companyId, {
        phone,
        name: `+${phone}`, // Placeholder name (enriched later)
        tags: [originTag],
        customFields: {
          source: "whatsapp_group",
          isGroupContact: true,
          isVerifiedLead: false, // NOT a lead until direct interaction
          sourceGroups: [groupJid],
        },
      });
      created++;
      existingPhones.add(phone); // Prevent re-processing within same batch

      // Queue enrichment job (Phase 2: get pushName + profile pic)
      await groupIndexQueue.add(
        "enrich",
        {
          type: "ENRICH_CONTACT",
          companyId,
          groupJid,
          sessionId,
          contactPhone: phone,
          senderJid: cleanJid,
        },
        { delay: 2000 * created }, // Stagger enrichment to avoid rate limits
      );
    } catch (error) {
      Logger.warn(`[GroupIndexer] Failed to create contact for ${phone}`, {
        error: (error as Error).message,
      });
    }
  }

  Logger.info(
    `[GroupIndexer] ✅ Group "${resolvedGroupName}" indexed: ${created} created, ${tagged} tagged, ${skipped} skipped (LID/invalid)`,
  );
}

/**
 * ENRICH_CONTACT
 * Progressive enrichment: fetch profile pic and update contact name
 * from WhatsApp in background (Phase 2, lazy loading).
 */
async function enrichContact(data: GroupIndexJob): Promise<void> {
  const { companyId, sessionId, contactPhone, senderJid } = data;
  if (!contactPhone || !senderJid) return;

  const sock = whatsappService.getSocket(sessionId);
  if (!sock) return;

  try {
    // Try to get profile picture
    let profilePicUrl: string | undefined;
    try {
      profilePicUrl = await sock.profilePictureUrl(senderJid, "image");
    } catch {
      // Profile pic not available (privacy settings)
    }

    // Get contact status/about
    let about: string | undefined;
    try {
      const status = await sock.fetchStatus(senderJid);
      const statusResult = status as
        | { status?: string }
        | Array<{ status?: string }>
        | undefined;
      if (statusResult) {
        if (Array.isArray(statusResult) && statusResult[0]?.status) {
          about = String(statusResult[0].status);
        } else if (
          !Array.isArray(statusResult) &&
          (statusResult as { status?: string }).status
        ) {
          about = String((statusResult as { status?: string }).status);
        }
      }
    } catch {
      // Status not available
    }

    // Update contact if we got any enrichment data
    if (profilePicUrl || about) {
      const contact = await contactRepository.findFirst({
        where: { companyId, phone: contactPhone, deletedAt: null },
      });

      if (contact) {
        const updates: Record<string, unknown> = {};
        if (profilePicUrl && !contact.profilePicUrl) {
          updates.profilePicUrl = profilePicUrl;
        }
        if (about && !contact.about) {
          updates.about = about;
        }

        if (Object.keys(updates).length > 0) {
          await contactRepository.update(contact.id, updates);
          Logger.debug(
            `[GroupIndexer] 🎨 Enriched contact ${contactPhone}: ${Object.keys(updates).join(", ")}`,
          );
        }
      }
    }
  } catch (error) {
    Logger.debug(`[GroupIndexer] Enrichment skipped for ${contactPhone}`, {
      error: (error as Error).message,
    });
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

export const groupContactIndexer = {
  /**
   * Start the BullMQ worker. Called from workerLoader.
   */
  startWorker(): void {
    if (workerInstance) return;

    workerInstance = new Worker<GroupIndexJob>(QUEUE_NAME, processJob, {
      connection,
      concurrency: 2, // Process 2 groups at a time max
      limiter: {
        max: 10,
        duration: 60000, // Max 10 jobs per minute
      },
    });

    workerInstance.on("completed", (job) => {
      Logger.debug(`[GroupIndexer] ✅ Job ${job.name} completed`);
    });

    workerInstance.on("failed", (job, err) => {
      Logger.warn(`[GroupIndexer] ❌ Job ${job?.name} failed: ${err.message}`);
    });

    Logger.info(
      "[GroupIndexer] 🚀 Worker started (concurrency: 2, rate: 10/min)",
    );
  },

  /**
   * Queue a group for async participant indexing.
   * Called from InboundMessageHandler when a group message arrives.
   */
  async queueGroupForIndexing(
    companyId: string,
    groupJid: string,
    sessionId: string,
    groupName?: string,
  ): Promise<void> {
    // Deduplicate: don't re-index same group within 5 minutes
    const dedupKey = `${companyId}:${groupJid}`;
    const jobId = `group-index-${dedupKey}`;

    await groupIndexQueue.add(
      "index",
      {
        type: "INDEX_GROUP_PARTICIPANTS",
        companyId,
        groupJid,
        sessionId,
        groupName,
      },
      {
        jobId, // BullMQ deduplication by jobId
        delay: 3000, // Small delay to batch concurrent group messages
      },
    );
  },

  /**
   * Graceful shutdown.
   */
  async shutdown(): Promise<void> {
    if (workerInstance) {
      await workerInstance.close();
      workerInstance = null;
      Logger.info("[GroupIndexer] Worker shut down");
    }
  },
};
