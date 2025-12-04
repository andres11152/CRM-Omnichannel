import { prisma } from "@/config/prisma";
import { generateAIResponse } from "@/services/aiResponseService";

async function main() {
  console.log("--- AI DEBUG START ---");
  try {
    const queue = await prisma.queue.findFirst({
      where: { name: { contains: "nueva", mode: "insensitive" } },
      include: { aiAssistant: true },
    });

    if (!queue) {
      console.error("❌ Queue 'nueva' not found.");
      return;
    }
    console.log(`✅ Queue found: ${queue.name} (${queue.id})`);

    if (!queue.aiAssistant) {
      console.error("❌ Queue has NO AI Assistant assigned.");
      return;
    }
    console.log(
      `✅ AI Assistant assigned: ${queue.aiAssistant.name} (${queue.aiAssistant.id})`
    );

    const companyId = queue.companyId;
    const config = await prisma.aIConfig.findUnique({ where: { companyId } });

    if (!config) {
      console.error("❌ No AI Config found for company.");
    } else if (!config.geminiKey) {
      console.error("❌ Gemini Key is MISSING in AI Config.");
    } else {
      console.log("✅ Gemini Key is present.");
    }

    console.log("Testing AI Response generation...");
    const response = await generateAIResponse(
      companyId,
      queue.aiAssistant.id,
      "Hola, quiero información",
      []
    );

    if (response) {
      console.log(`✅ AI Response Success: "${response}"`);
    } else {
      console.error("❌ AI Response Failed (returned null).");
    }
  } catch (e) {
    console.error("❌ Unexpected Error:", e);
  } finally {
    await prisma.$disconnect();
    console.log("--- AI DEBUG END ---");
  }
}

main();
