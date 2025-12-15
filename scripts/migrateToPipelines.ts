/**
 * Migration Script: Convert DealStage Enums to Dynamic Pipelines
 *
 * This script handles the data migration when moving from hard-coded
 * enum stages to dynamic, tenant-configurable pipelines.
 *
 * Run after: prisma migrate dev --create-only
 * Then manually add this as a data migration step
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Default stage configuration matching the old enum
const DEFAULT_STAGES = [
  { name: "Nuevo", order: 0, color: "#3B82F6" }, // Blue (NEW)
  { name: "Calificado", order: 1, color: "#8B5CF6" }, // Purple (QUALIFIED)
  { name: "Propuesta", order: 2, color: "#F59E0B" }, // Amber (PROPOSAL)
  { name: "Negociación", order: 3, color: "#EC4899" }, // Pink (NEGOTIATION)
  { name: "Ganado", order: 4, color: "#10B981" }, // Green (WON)
  { name: "Perdido", order: 5, color: "#EF4444" }, // Red (LOST)
];

// Mapping from old enum to new stage index
const ENUM_TO_STAGE_INDEX: Record<string, number> = {
  NEW: 0,
  QUALIFIED: 1,
  PROPOSAL: 2,
  NEGOTIATION: 3,
  WON: 4,
  LOST: 5,
};

async function migrateToDefaultPipelines() {
  console.log("🚀 Starting migration to dynamic pipelines...");

  // Get all companies
  const companies = await prisma.company.findMany({
    select: { id: true, name: true },
  });

  console.log(`📊 Found ${companies.length} companies to migrate`);

  for (const company of companies) {
    console.log(`\n🏢 Processing company: ${company.name} (${company.id})`);

    // Check if company already has a pipeline
    const existingPipeline = await prisma.pipeline.findFirst({
      where: { companyId: company.id },
    });

    if (existingPipeline) {
      console.log(`   ⏭️  Pipeline already exists, skipping...`);
      continue;
    }

    // Create default pipeline for this company
    const pipeline = await prisma.pipeline.create({
      data: {
        companyId: company.id,
        name: "Pipeline de Ventas",
        isDefault: true,
      },
    });

    console.log(`   ✅ Created pipeline: ${pipeline.name}`);

    // Create stages for this pipeline
    const stagePromises = DEFAULT_STAGES.map((stageConfig) =>
      prisma.stage.create({
        data: {
          pipelineId: pipeline.id,
          name: stageConfig.name,
          order: stageConfig.order,
          color: stageConfig.color,
        },
      })
    );

    const stages = await Promise.all(stagePromises);
    console.log(`   ✅ Created ${stages.length} stages`);

    // Now migrate existing deals (if any)
    // Note: This assumes the old 'stage' column still exists temporarily
    // You would run this BEFORE dropping the old column

    // Since we can't query the old 'stage' enum directly in this new schema,
    // we'll use raw SQL or do this in the actual migration file
    console.log(`   📦 Deals will be migrated via Prisma migration SQL`);
  }

  console.log("\n✅ Migration completed successfully!");
}

// Execute if run directly
if (require.main === module) {
  migrateToDefaultPipelines()
    .catch((error) => {
      console.error("❌ Migration failed:", error);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}

export { migrateToDefaultPipelines, DEFAULT_STAGES, ENUM_TO_STAGE_INDEX };
