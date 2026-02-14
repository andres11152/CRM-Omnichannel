import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Starting Clean Database Seed for Reply CRM...");

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

  console.log("✅ Plans created");

  // =========================================================================
  // 1. MASTER ACCOUNT (Dueño del Software) - NO TIENE PLAN
  // =========================================================================

  const masterCompany = await prisma.company.upsert({
    where: { slug: "reply-software" },
    update: {
      planId: null, // MASTER NO TIENE PLAN
    },
    create: {
      id: "99999999-9999-9999-9999-999999999999", // Fixed ID para identificarlo siempre
      name: "Reply Software (Master)",
      slug: "reply-software",
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

  const masterPassword = await bcrypt.hash("Master2025!", 10);

  const masterUser = await prisma.user.upsert({
    where: { email: "master@reply.com" },
    update: {},
    create: {
      email: "master@reply.com",
      name: "Andres Betancourt",
      password: masterPassword,
      role: "MASTER",
      companyId: masterCompany.id,
    },
  });

  console.log(
    `👑 MASTER Created: ${masterUser.email} (Company: ${masterCompany.name})`,
  );

  // =========================================================================
  // 2. TENANT DE PRUEBAS (Cliente Simulado) - TIENE PLAN PRO
  // =========================================================================

  const tenantCompany = await prisma.company.upsert({
    where: { slug: "reply-tenant-demo" },
    update: {
      planId: proPlan.id,
    },
    create: {
      id: "88888888-8888-8888-8888-888888888888",
      name: "Reply Tenant Demo",
      slug: "reply-tenant-demo",
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

  const tenantPassword = await bcrypt.hash("admin123", 10);

  const tenantUser = await prisma.user.upsert({
    where: { email: "admin@reply.com" },
    update: {},
    create: {
      email: "admin@reply.com",
      name: "Admin Tenant",
      password: tenantPassword,
      role: "ADMIN", // Es ADMIN de su empresa, NO MASTER del sistema
      companyId: tenantCompany.id,
    },
  });

  console.log(
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
          { name: "Contactado", color: "#F59E0B", order: 2 },
          { name: "Cerrado Ganado", color: "#10B981", order: 3 },
        ],
      },
    },
  });

  console.log("✅ Default assets created for Tenant");

  console.log("\n🎉 Database Seed Completed Successfully!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
