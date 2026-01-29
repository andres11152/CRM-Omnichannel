import { PrismaClient, UserRole } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Empezando el sembrado de la base de datos...");

  const plainPassword = "password123";
  const hashedPassword = await bcrypt.hash(plainPassword, 12);

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
        password: hashedPassword, // Force password update!
        role: userData.role, // Update role just in case
      },
      create: {
        ...userData,
        password: hashedPassword,
      },
    });
    console.log(
      `✅ Usuario creado/verificado: ${user.email} (Rol: ${user.role})`
    );
  }

  // --- CREACIÓN DE PLANES ---
  const plansToCreate = [
    {
      id: "free",
      name: "Free",
      price: 0,
      config: { max_users: 1, max_queues: 1 },
    },
    {
      id: "basic",
      name: "Basic",
      price: 49,
      config: { max_users: 5, max_queues: 5 },
    },
    {
      id: "pro",
      name: "Pro",
      price: 99,
      config: { max_users: 20, max_queues: 20 },
    },
  ];

  for (const planData of plansToCreate) {
    const plan = await prisma.plan.upsert({
      where: { id: planData.id },
      update: {
        name: planData.name,
        price: planData.price,
        config: planData.config,
      },
      create: planData,
    });
    console.log(`✅ Plan creado/verificado: ${plan.name}`);
  }

  console.log(
    '🌱 Sembrado completado. La contraseña para todos los usuarios es: "password123"'
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
