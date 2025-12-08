import { prisma } from "@/config/prisma";
import { whatsappService } from "./whatsapp.service";
import { messageProcessor } from "./messageProcessor.service";

/**
 * Service to handle Campaign Execution
 * Implements a throttled iteration to avoid banning numbers
 */
export const campaignService = {
  async executeCampaign(campaignId: string, companyId: string) {
    console.log(`[Campaign] Starting execution for ${campaignId}`);

    try {
      // 1. Fetch Campaign Details
      const campaignRaw = await prisma.$queryRaw<any[]>`
        SELECT * FROM campaigns WHERE id = ${campaignId} AND "companyId" = ${companyId}
      `;
      const campaign = campaignRaw[0];

      if (!campaign) throw new Error("Campaign not found");
      if (campaign.status === "completed" || campaign.status === "failed") {
        console.log(`[Campaign] Campaign ${campaignId} already finished.`);
        return;
      }

      // 2. Fetch Audience based on Tags
      // If targetTags is empty, maybe fetch ALL contacts? risky. Let's assume tags are required or specific logic.
      let contacts: any[] = [];

      if (campaign.targetTags && campaign.targetTags.length > 0) {
        // We need to find contacts that have ANY of these tags.
        // Since Prisma Raw is used and tags might be array column or relation, let's look at schema.
        // Based on typical schema, Contact has 'tags' string array.

        // PostgreSQL arrays overlap operator: &&
        contacts = await prisma.$queryRaw<any[]>`
             SELECT * FROM contacts 
             WHERE "companyId" = ${companyId} 
             AND tags && ${campaign.targetTags}::text[]
           `;
      } else {
        // Fallback: Fetch all contacts? Or abort?
        // Better safe: Fetch contacts with valid phone
        contacts = await prisma.$queryRaw<any[]>`
             SELECT * FROM contacts WHERE "companyId" = ${companyId} AND phone IS NOT NULL
          `;
      }

      console.log(`[Campaign] Audience size: ${contacts.length}`);

      // Update Stats
      const stats = {
        targetAudienceSize: contacts.length,
        sent: 0,
        delivered: 0,
        read: 0,
        replied: 0,
        failed: 0,
      };

      await prisma.$executeRaw`
        UPDATE campaigns SET stats = ${JSON.stringify(
          stats
        )}::jsonb WHERE id = ${campaignId}
      `;

      // 3. Iterate and Send with Delay (Throttling)
      // Speed: 1 message every 2-5 seconds (random) to simulate human behavior and avoid bans.
      // ~ 12-30 messages per minute. 500 contacts = ~20-40 mins.

      for (const contact of contacts) {
        try {
          const phone = contact.phone; // already includes country code usually
          if (!phone) continue;

          const remoteJid = `${phone}@s.whatsapp.net`;
          const content = campaign.messageContent || "Hola!";

          // TODO: If TemplateID exists, handle Template logic.
          // For now, text support.

          // Use messageProcessor to ensure it's logged in DB and emitted to socket
          // We flag it as outbound.
          await messageProcessor.process({
            companyId,
            sessionId: "campaign_worker", // Virtual session
            remoteJid,
            text: content,
            isOutbound: true,
            senderName: "Campaign Bot",
          });

          // Send via WhatsApp actually
          // Important: messageProcessor saves to DB, but does it SEND?
          // Checking messageProcessor code...
          // messageProcessor logic:
          // 1. Finds/Creates User
          // 2. Finds/Creates Conversation
          // 3. Creates Message in DB
          // 4. Emits Socket
          // 5. Triggers AI (if inbound)

          // It does NOT call whatsappService.sendMessage for OUTBOUND messages initiated by API.
          // It assumes "isOutbound" means "I read this from the phone".

          // So we MUST send it explicitly here.
          await whatsappService.sendMessage(remoteJid, content);

          stats.sent++;

          // Update database every 10 messages to reduce load
          if (stats.sent % 10 === 0) {
            await prisma.$executeRaw`
                    UPDATE campaigns SET stats = ${JSON.stringify(
                      stats
                    )}::jsonb WHERE id = ${campaignId}
                `;
          }

          // Random Delay 2s - 5s
          const delay = Math.floor(Math.random() * 3000) + 2000;
          await new Promise((r) => setTimeout(r, delay));
        } catch (err) {
          console.error(`[Campaign] Failed to send to ${contact.phone}:`, err);
          stats.failed++;
        }
      }

      // 4. Finish
      await prisma.$executeRaw`
        UPDATE campaigns 
        SET status = 'completed', stats = ${JSON.stringify(stats)}::jsonb 
        WHERE id = ${campaignId}
      `;
      console.log(`[Campaign] Finished ${campaignId}`);
    } catch (error) {
      console.error(`[Campaign] Critical Error:`, error);
      await prisma.$executeRaw`
        UPDATE campaigns SET status = 'failed' WHERE id = ${campaignId}
       `;
    }
  },
};
