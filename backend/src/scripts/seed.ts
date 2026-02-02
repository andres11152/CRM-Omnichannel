import { PrismaClient, UserRole } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log(
    "🌱 Empezando el sembrado de la base de datos (RESET COMPLETO)...",
  );

  // La base de datos ya debería estar limpia si usamos force-reset, pero por si acaso limpiamos referencias
  // Not necessary if using force-reset, but good practice in seed logic usually.
  // We will rely on force-reset for true clean.

  const plainPassword = "password123";
  const hashedPassword = await bcrypt.hash(plainPassword, 12);

  // 1. CREAR PLANES (Primero, para que existan las referencias)
  console.log("Creating Plans...");
  const plansToCreate = [
    {
      id: "11111111-1111-1111-1111-111111111111",
      name: "Free",
      price: 0,
      config: { max_users: 1, max_queues: 1 },
    },
    {
      id: "22222222-2222-2222-2222-222222222222",
      name: "Basic",
      price: 49,
      config: { max_users: 5, max_queues: 5 },
    },
    {
      id: "33333333-3333-3333-3333-333333333333",
      name: "Pro",
      price: 99,
      config: { max_users: 20, max_queues: 20 },
    },
    {
      id: "44444444-4444-4444-4444-444444444444",
      name: "Unlimited",
      price: 299,
      config: {
        max_users: 9999,
        max_queues: 9999,
        max_whatsapp_sessions: 9999,
        max_ai_assistants: 9999,
      },
    },
  ];

  for (const planData of plansToCreate) {
    await prisma.plan.upsert({
      where: { id: planData.id },
      update: planData,
      create: planData,
    });
  }
  console.log("✅ Planes creados.");

  // 2. CREAR EMPRESA POR DEFECTO (Asignando Unlimited)
  // Usamos un CUID o UUID válido para la empresa para evitar problemas futuros de tipos
  // 'default_company_id' a veces choca si el schema exige CUID. Usaremos un UUID manual válido.
  const COMPANY_ID = "99999999-9999-9999-9999-999999999999";

  const defaultCompany = await prisma.company.upsert({
    where: { id: COMPANY_ID },
    update: {
      planId: "44444444-4444-4444-4444-444444444444", // Asegurar Unlimited
    },
    create: {
      id: COMPANY_ID,
      name: "Reply Inc (Default)",
      slug: "reply-inc-default", // Importante para URL o identificación
      planId: "44444444-4444-4444-4444-444444444444", // Unlimited
      settings: {},
    },
  });
  console.log(
    `✅ Empresa creada: ${defaultCompany.name} (${defaultCompany.id}) con Plan Unlimited`,
  );

  // 3. CREAR USUARIOS
  const usersToCreate = [
    {
      email: "master@reply.com",
      name: "Master Admin",
      role: UserRole.MASTER,
    },
    {
      email: "admin@reply.com",
      name: "Admin User",
      role: UserRole.ADMIN,
    },
    {
      email: "agent@reply.com",
      name: "Agent User",
      role: UserRole.AGENT,
    },
  ];

  for (const userData of usersToCreate) {
    const user = await prisma.user.upsert({
      where: { email: userData.email },
      update: {
        password: hashedPassword,
        role: userData.role,
        companyId: defaultCompany.id,
      },
      create: {
        ...userData,
        password: hashedPassword,
        companyId: defaultCompany.id,
      },
    });
    console.log(
      `✅ Usuario creado: ${user.email} (Rol: ${user.role}) vinvulado a ${defaultCompany.name}`,
    );
  }

  console.log('🌱 Sembrado completado exitosamente. Password: "password123"');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
