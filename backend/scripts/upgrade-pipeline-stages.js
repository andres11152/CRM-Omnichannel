/**
 * 🔧 One-time script: Upgrade existing pipeline stages to Enterprise 6-stage flow
 *
 * Current:  Nuevo Lead → Contactado → Cerrado Ganado
 * Target:   Nuevo Lead → Contactado → Propuesta → Negociación → Ganado → Perdido
 */
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function upgradePipelineStages() {
  console.log("🚀 Pipeline Stage Upgrade Script");
  console.log("=".repeat(50));

  // 1. Find all pipelines
  const pipelines = await prisma.pipeline.findMany({
    include: {
      stages: { orderBy: { order: "asc" } },
      _count: { select: { deals: true } },
    },
  });

  if (pipelines.length === 0) {
    console.log("❌ No pipelines found. Nothing to upgrade.");
    return;
  }

  for (const pipeline of pipelines) {
    console.log(`\n📊 Pipeline: "${pipeline.name}" (${pipeline.id})`);
    console.log(`   Company: ${pipeline.companyId}`);
    console.log(`   Deals: ${pipeline._count.deals}`);
    console.log(`   Current stages:`);
    pipeline.stages.forEach((s) =>
      console.log(`     [${s.order}] ${s.name} (${s.color})`),
    );

    const stageNames = pipeline.stages.map((s) => s.name.toLowerCase());

    // Define the 6-stage enterprise flow
    const enterpriseStages = [
      { name: "Nuevo Lead", order: 0, color: "#3B82F6" },
      { name: "Contactado", order: 1, color: "#8B5CF6" },
      { name: "Propuesta", order: 2, color: "#F59E0B" },
      { name: "Negociación", order: 3, color: "#EC4899" },
      { name: "Ganado", order: 4, color: "#10B981" },
      { name: "Perdido", order: 5, color: "#EF4444" },
    ];

    // Check which stages are missing
    const missingStages = enterpriseStages.filter(
      (es) =>
        !stageNames.some(
          (existing) =>
            existing === es.name.toLowerCase() ||
            (es.name === "Ganado" && existing.includes("ganado")) ||
            (es.name === "Perdido" && existing.includes("perdido")) ||
            (es.name === "Nuevo Lead" && existing.includes("nuevo")),
        ),
    );

    if (missingStages.length === 0) {
      console.log("   ✅ Already has all 6 stages. Skipping.");
      continue;
    }

    console.log(`\n   🔧 Adding ${missingStages.length} missing stages:`);

    // First: Update "Cerrado Ganado" → rename to "Ganado" and reorder
    const cerradoGanado = pipeline.stages.find((s) =>
      /cerrado\s*ganado/i.test(s.name),
    );
    if (cerradoGanado) {
      // Need to handle unique constraint on [pipelineId, order]
      // First move it to a safe temporary order
      await prisma.stage.update({
        where: { id: cerradoGanado.id },
        data: { order: 99 }, // temp order to avoid conflict
      });
      console.log(`     ♻️  Renamed "Cerrado Ganado" → "Ganado" (order 4)`);
      await prisma.stage.update({
        where: { id: cerradoGanado.id },
        data: { name: "Ganado", order: 4, color: "#10B981" },
      });
    }

    // Now add the missing stages
    for (const stage of missingStages) {
      try {
        await prisma.stage.create({
          data: {
            pipelineId: pipeline.id,
            name: stage.name,
            order: stage.order,
            color: stage.color,
          },
        });
        console.log(
          `     ✅ Added: "${stage.name}" (order ${stage.order}, ${stage.color})`,
        );
      } catch (e) {
        // If unique constraint fails, try with a slightly different order
        if (e.code === "P2002") {
          const altOrder = stage.order + 0.5;
          await prisma.stage.create({
            data: {
              pipelineId: pipeline.id,
              name: stage.name,
              order: altOrder,
              color: stage.color,
            },
          });
          console.log(
            `     ✅ Added: "${stage.name}" (order ${altOrder}, ${stage.color}) [adjusted]`,
          );
        } else {
          console.error(`     ❌ Failed to add "${stage.name}":`, e.message);
        }
      }
    }

    // Verify final state
    const updatedStages = await prisma.stage.findMany({
      where: { pipelineId: pipeline.id },
      orderBy: { order: "asc" },
    });
    console.log("\n   📋 Final stages:");
    updatedStages.forEach((s) =>
      console.log(`     [${s.order}] ${s.name} (${s.color})`),
    );
  }

  console.log("\n" + "=".repeat(50));
  console.log("✅ Pipeline upgrade complete!");
}

upgradePipelineStages()
  .catch((e) => {
    console.error("❌ Script failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
