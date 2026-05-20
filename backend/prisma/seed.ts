import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { Logger } from "../src/utils/logger";

const prisma = new PrismaClient();

async function main() {
  Logger.info("🌱 Starting Clean Database Seed for Reply CRM...");

  // 1. CREATE PLANS (Para que los tenants puedan suscribirse)
  // IDs uuid v4 para cumplir con validaciones del backend
  const planFreeId = "11111111-1111-1111-1111-111111111111";
  const planProId = "22222222-2222-2222-2222-222222222222";
  const planEnterpriseId = "33333333-3333-3333-3333-333333333333";

  await prisma.plan.upsert({
    where: { id: planFreeId },
    update: {},
    create: {
      id: planFreeId,
      name: "Free",
      price: 0,
      config: {
        max_users: 1,
        max_whatsapp_sessions: 1,
        max_queues: 1,
        enable_ai: false,
      },
      storageLimitGb: 1,
      maxContacts: 100,
      maxCompanies: 1,
    },
  });

  const proPlan = await prisma.plan.upsert({
    where: { id: planProId },
    update: {},
    create: {
      id: planProId,
      name: "Pro",
      price: 49,
      config: {
        max_users: 5,
        max_whatsapp_sessions: 5,
        max_queues: 5,
        enable_ai: true,
        enable_api: true,
      },
      storageLimitGb: 50,
      maxContacts: 10000,
      maxCompanies: 3,
    },
  });

  await prisma.plan.upsert({
    where: { id: planEnterpriseId },
    update: {},
    create: {
      id: planEnterpriseId,
      name: "Enterprise",
      price: 199,
      config: {
        max_users: 50,
        max_whatsapp_sessions: 20,
        max_queues: 20,
        enable_ai: true,
        enable_api: true,
        max_ai_assistants: 10,
        max_workflows: 50,
      },
      storageLimitGb: 500,
      maxContacts: 100000,
      maxCompanies: 10,
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
