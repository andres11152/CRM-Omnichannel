import { prisma } from "../config/prisma";

async function main() {
  try {
    console.log("Checking DB connection...");
    const userCount = await prisma.user.count();
    console.log(`Users: ${userCount}`);

    console.log("Checking Campaign model...");
    const campaignCount = await prisma.campaign.count();
    console.log(`Campaigns: ${campaignCount}`);

    console.log("Checking Flow model...");
    const flowCount = await prisma.flow.count();
    console.log(`Flows: ${flowCount}`);

    console.log("Checking Tag model...");
    const tagCount = await prisma.tag.count();
    console.log(`Tags: ${tagCount}`);

    console.log("DB Check Passed!");
  } catch (e) {
    console.error("DB Check Failed:", e);
  } finally {
    await prisma.$disconnect();
  }
}

main();
