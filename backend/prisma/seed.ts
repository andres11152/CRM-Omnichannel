import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { Logger } from "../src/utils/logger";

const prisma = new PrismaClient();

async function main() {
  Logger.info("🌱 Starting Clean Database Seed for Sentry CRM...");

  // 1. CREATE PLANS (Para que los tenants puedan suscribirse)
  // IDs uuid v4 para cumplir con validaciones del backend
  const planStarterId = "11111111-1111-1111-1111-111111111111"; // Starter
  const planGrowthId = "15151515-1515-1515-1515-151515151515";  // Growth
  const planProId = "22222222-2222-2222-2222-222222222222";     // Pro
  const planEnterpriseId = "33333333-3333-3333-3333-333333333333"; // Enterprise
  const planUltimateId = "44444444-4444-4444-4444-444444444444";  // Ultimate

  await prisma.plan.upsert({
    where: { id: planStarterId },
    update: {
      name: "Starter",
      price: 4.90,
      config: {
        max_users: 1,
        max_whatsapp_sessions: 1,
        max_queues: 1,
        enable_ai: false,
        enable_api: false,
      },
      storageLimitGb: 5,
      maxContacts: 1000,
      maxCompanies: 1,
    },
    create: {
      id: planStarterId,
      name: "Starter",
      price: 4.90,
      config: {
        max_users: 1,
        max_whatsapp_sessions: 1,
        max_queues: 1,
        enable_ai: false,
        enable_api: false,
      },
      storageLimitGb: 5,
      maxContacts: 1000,
      maxCompanies: 1,
    },
  });

  await prisma.plan.upsert({
    where: { id: planGrowthId },
    update: {
      name: "Growth",
      price: 9.90,
      config: {
        max_users: 3,
        max_whatsapp_sessions: 2,
        max_queues: 3,
        enable_ai: true,
        enable_api: false,
      },
      storageLimitGb: 20,
      maxContacts: 5000,
      maxCompanies: 1,
    },
    create: {
      id: planGrowthId,
      name: "Growth",
      price: 9.90,
      config: {
        max_users: 3,
        max_whatsapp_sessions: 2,
        max_queues: 3,
        enable_ai: true,
        enable_api: false,
      },
      storageLimitGb: 20,
      maxContacts: 5000,
      maxCompanies: 1,
    },
  });

  const proPlan = await prisma.plan.upsert({
    where: { id: planProId },
    update: {
      name: "Pro",
      price: 19.90,
      config: {
        max_users: 10,
        max_whatsapp_sessions: 5,
        max_queues: 10,
        enable_ai: true,
        enable_api: true,
        max_workflows: 10,
        max_ai_assistants: 3,
      },
      storageLimitGb: 50,
      maxContacts: 20000,
      maxCompanies: 3,
    },
    create: {
      id: planProId,
      name: "Pro",
      price: 19.90,
      config: {
        max_users: 10,
        max_whatsapp_sessions: 5,
        max_queues: 10,
        enable_ai: true,
        enable_api: true,
        max_workflows: 10,
        max_ai_assistants: 3,
      },
      storageLimitGb: 50,
      maxContacts: 20000,
      maxCompanies: 3,
    },
  });

  await prisma.plan.upsert({
    where: { id: planEnterpriseId },
    update: {
      name: "Enterprise",
      price: 39.90, // Optimized from 199.00
      config: {
        max_users: 30,
        max_whatsapp_sessions: 10,
        max_queues: 20,
        enable_ai: true,
        enable_api: true,
        max_ai_assistants: 10,
        max_workflows: 30,
      },
      storageLimitGb: 200,
      maxContacts: 50000,
      maxCompanies: 10,
    },
    create: {
      id: planEnterpriseId,
      name: "Enterprise",
      price: 39.90,
      config: {
        max_users: 30,
        max_whatsapp_sessions: 10,
        max_queues: 20,
        enable_ai: true,
        enable_api: true,
        max_ai_assistants: 10,
        max_workflows: 30,
      },
      storageLimitGb: 200,
      maxContacts: 50000,
      maxCompanies: 10,
    },
  });

  await prisma.plan.upsert({
    where: { id: planUltimateId },
    update: {
      name: "Ultimate",
      price: 79.90,
      config: {
        max_users: 100, // Practically unlimited
        max_whatsapp_sessions: 25,
        max_queues: 50,
        enable_ai: true,
        enable_api: true,
        max_ai_assistants: 30,
        max_workflows: 100,
      },
      storageLimitGb: 500,
      maxContacts: 100000,
      maxCompanies: 20,
    },
    create: {
      id: planUltimateId,
      name: "Ultimate",
      price: 79.90,
      config: {
        max_users: 100,
        max_whatsapp_sessions: 25,
        max_queues: 50,
        enable_ai: true,
        enable_api: true,
        max_ai_assistants: 30,
        max_workflows: 100,
      },
      storageLimitGb: 500,
      maxContacts: 100000,
      maxCompanies: 20,
    },
  });

  Logger.info("✅ Plans created");

  // =========================================================================
  // 1. MASTER ACCOUNT (Dueño del Software) - NO TIENE PLAN
  // =========================================================================

  const masterCompany = await prisma.company.upsert({
    where: { id: "99999999-9999-9999-9999-999999999999" },
    update: {
      planId: null, // MASTER NO TIENE PLAN
      name: "Sentry Software (Master)",
      slug: "sentry-software",
    },
    create: {
      id: "99999999-9999-9999-9999-999999999999", // Fixed ID para identificarlo siempre
      name: "Sentry Software (Master)",
      slug: "sentry-software",
      phone: "+573000000000",
      timezone: "America/Bogota",
      planId: null, // MASTER NO TIENE PLAN
      settings: {
        whatsappEnabled: true,
        emailEnabled: true,
        smsEnabled: true,
      },
    },
  });

  const masterPassword = await bcrypt.hash("$mOo*8vR3", 10);

  const masterUser = await prisma.user.upsert({
    where: { email: "master@sentrycrm.cloud" },
    update: {
      password: masterPassword,
    },
    create: {
      email: "master@sentrycrm.cloud",
      name: "Andres Betancourt",
      password: masterPassword,
      role: "MASTER",
      companyId: masterCompany.id,
    },
  });

  Logger.info(
    `👑 MASTER Created: ${masterUser.email} (Company: ${masterCompany.name})`,
  );

  // =========================================================================
  // 2. TENANT DE PRUEBAS (Cliente Simulado) - TIENE PLAN PRO
  // =========================================================================

  const tenantCompany = await prisma.company.upsert({
    where: { id: "88888888-8888-8888-8888-888888888888" },
    update: {
      planId: proPlan.id,
      name: "Sentry Tenant Demo",
      slug: "sentry-tenant-demo",
    },
    create: {
      id: "88888888-8888-8888-8888-888888888888",
      name: "Sentry Tenant Demo",
      slug: "sentry-tenant-demo",
      phone: "+1234567890",
      timezone: "America/New_York",
      planId: proPlan.id, // ESTE SÍ PAGA / TIENE PLAN
      settings: {
        whatsappEnabled: true,
        emailEnabled: true,
        smsEnabled: false,
      },
    },
  });

  const tenantPassword = await bcrypt.hash("g+qrN6Zh", 10);

  const tenantUser = await prisma.user.upsert({
    where: { email: "admin@sentrycrm.cloud" },
    update: {
      password: tenantPassword,
    },
    create: {
      email: "admin@sentrycrm.cloud",
      name: "Admin Tenant",
      password: tenantPassword,
      role: "ADMIN", // Es ADMIN de su empresa, NO MASTER del sistema
      companyId: tenantCompany.id,
    },
  });

  Logger.info(
    `🏢 TENANT Created: ${tenantUser.email} (Company: ${tenantCompany.name})`,
  );

  // =========================================================================
  // 3. ASSETS INICIALES (Solo para que no estén vacíos al entrar)
  // =========================================================================

  // Pipeline para el Tenant
  await prisma.pipeline.upsert({
    where: {
      companyId_isDefault: { companyId: tenantCompany.id, isDefault: true },
    },
    update: {},
    create: {
      name: "Ventas General",
      isDefault: true,
      companyId: tenantCompany.id,
      stages: {
        create: [
          { name: "Nuevo Lead", color: "#3B82F6", order: 1 },
          { name: "Contactado", color: "#6366F1", order: 2 },
          { name: "Calificado", color: "#8B5CF6", order: 3 },
          { name: "Propuesta", color: "#F59E0B", order: 4 },
          { name: "Negociación", color: "#EC4899", order: 5 },
          { name: "Cerrado Ganado", color: "#10B981", order: 6 },
          { name: "Cerrado Perdido", color: "#EF4444", order: 7 },
        ],
      },
    },
  });

  Logger.info("✅ Default assets created for Tenant");

  Logger.info("\n🎉 Database Seed Completed Successfully!");
}

main()
  .catch((e) => {
    Logger.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
