/**
 * 🧹 DATABASE CLEANUP SCRIPT
 * Fixes invalid LID mappings in the Contact table
 *
 * Run this with: npx ts-node scripts/fix-lid-mappings.ts
 */

import { prisma } from "../src/config/prisma";
import { Prisma } from "@prisma/client";

async function cleanupInvalidLidMappings() {
  console.log("🔍 Starting LID Mapping Cleanup...\n");

  try {
    // 1. Find all contacts (we'll filter in JS since Prisma JSON path queries are limited)
    const allContacts = await prisma.contact.findMany({
      where: {
        customFields: {
          not: Prisma.JsonNull,
        },
      },
    });

    // Filter contacts that have a 'lid' field in customFields
    const contactsWithLid = allContacts.filter((contact) => {
      const customFields = contact.customFields as any;
      return customFields && customFields.lid;
    });

    console.log(
      `📊 Found ${contactsWithLid.length} contacts with LID mappings\n`
    );

    let fixedCount = 0;
    let invalidCount = 0;

    for (const contact of contactsWithLid) {
      const customFields = contact.customFields as any;
      const lid = customFields?.lid;

      if (!contact.phone) {
        console.log(`⚠️ Skipping contact ${contact.id} - no phone number\n`);
        continue;
      }

      const phone = contact.phone.replace(/\D/g, "");

      if (!lid) continue;

      const cleanLid =
        typeof lid === "string"
          ? lid.replace(/@.*$/, "").replace(/\D/g, "")
          : "";

      // 🚨 DETECTION: Self-mapping (LID === Phone)
      if (cleanLid === phone) {
        console.log(`🛑 INVALID: Self-mapping detected`);
        console.log(`   Contact ID: ${contact.id}`);
        console.log(`   Phone: ${phone}`);
        console.log(`   LID: ${cleanLid}`);
        console.log(`   Action: Removing LID field\n`);

        // Remove the invalid LID mapping
        const { lid: _, ...restFields } = customFields;
        await prisma.contact.update({
          where: { id: contact.id },
          data: {
            customFields: restFields,
          },
        });

        invalidCount++;
        continue;
      }

      // 🚨 DETECTION: LID is too short (not a real LID)
      if (cleanLid.length < 15) {
        console.log(
          `⚠️ WARNING: LID too short (might be valid or might be error)`
        );
        console.log(`   Contact ID: ${contact.id}`);
        console.log(`   Phone: ${phone}`);
        console.log(`   LID: ${cleanLid} (${cleanLid.length} digits)`);
        console.log(`   Action: Skipping (manual review needed)\n`);
        continue;
      }

      // 🚨 DETECTION: Phone is too long (it's actually a LID, not a phone)
      if (phone.length > 14) {
        console.log(`🛑 CRITICAL: Contact.phone is actually a LID!`);
        console.log(`   Contact ID: ${contact.id}`);
        console.log(`   Phone: ${phone} (${phone.length} digits)`);
        console.log(`   LID in customFields: ${cleanLid}`);
        console.log(`   Action: MANUAL REVIEW REQUIRED - Cannot auto-fix\n`);
        invalidCount++;
        continue;
      }

      // ✅ VALID: LID mapping looks correct
      console.log(`✅ VALID: LID mapping is correct`);
      console.log(`   Phone: ${phone} (${phone.length} digits)`);
      console.log(`   LID: ${cleanLid} (${cleanLid.length} digits)\n`);
    }

    // 2. Find contacts where the PHONE itself is a LID (ghost contacts)
    const ghostContacts = await prisma.contact.findMany({
      where: {
        companyId: { not: undefined },
      },
    });

    console.log("\n🔍 Checking for Ghost Contacts (phone as LID)...\n");

    let ghostCount = 0;
    for (const contact of ghostContacts) {
      if (!contact.phone) continue;

      const phone = contact.phone.replace(/\D/g, "");

      // If phone is longer than 14 digits, it's likely a LID
      if (phone.length > 14) {
        console.log(`👻 GHOST CONTACT FOUND:`);
        console.log(`   Contact ID: ${contact.id}`);
        console.log(`   Name: ${contact.name}`);
        console.log(`   Phone (LID): ${phone} (${phone.length} digits)`);
        console.log(`   Company ID: ${contact.companyId}`);
        console.log(`   Created: ${contact.createdAt}`);
        console.log(`   ⚠️ ACTION REQUIRED: Manual investigation needed`);
        console.log(`   💡 Check conversations to find real phone number\n`);

        ghostCount++;
      }
    }

    console.log("\n" + "=".repeat(60));
    console.log("📊 CLEANUP SUMMARY:");
    console.log("=".repeat(60));
    console.log(
      `✅ Valid LID mappings: ${
        contactsWithLid.length - invalidCount - fixedCount
      }`
    );
    console.log(`🛑 Invalid mappings removed: ${invalidCount}`);
    console.log(`👻 Ghost contacts found: ${ghostCount}`);
    console.log("=".repeat(60));

    if (ghostCount > 0) {
      console.log("\n⚠️ NEXT STEPS:");
      console.log("1. Review ghost contacts manually");
      console.log("2. Find associated conversations");
      console.log("3. Extract real phone numbers from message metadata");
      console.log("4. Update or delete ghost contacts");
    }
  } catch (error) {
    console.error("❌ Error during cleanup:", error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the cleanup
cleanupInvalidLidMappings().catch(console.error);
