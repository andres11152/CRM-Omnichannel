import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function upgradePipeline() {
  const pipeline = await prisma.pipeline.findFirst({
    where: { isDefault: true },
    include: { stages: true }
  });

  if (!pipeline) return;
  const existingStages = pipeline.stages;

  // First, shift all existing orders up by 100 to avoid unique constraint conflicts
  for (const existing of existingStages) {
    await prisma.stage.update({
      where: { id: existing.id },
      data: { order: existing.order + 100 }
    });
  }

  const newStages = [
    { name: "Nuevo Lead", color: "#3B82F6", order: 1 },
    { name: "Contactado", color: "#6366F1", order: 2 },
    { name: "Calificado", color: "#8B5CF6", order: 3 },
    { name: "Propuesta", color: "#F59E0B", order: 4 },
    { name: "Negociación", color: "#EC4899", order: 5 },
    { name: "Cerrado Ganado", color: "#10B981", order: 6 },
    { name: "Cerrado Perdido", color: "#EF4444", order: 7 },
  ];

  for (const newStage of newStages) {
    const existing = existingStages.find(s => s.name.toLowerCase() === newStage.name.toLowerCase());
    if (existing) {
      await prisma.stage.update({
        where: { id: existing.id },
        data: { color: newStage.color, order: newStage.order }
      });
      console.log(`Updated existing stage: ${newStage.name}`);
    } else {
      await prisma.stage.create({
        data: {
          pipelineId: pipeline.id,
          name: newStage.name,
          color: newStage.color,
          order: newStage.order
        }
      });
      console.log(`Created new stage: ${newStage.name}`);
    }
  }

  console.log("Pipeline upgraded successfully!");
}

upgradePipeline()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
