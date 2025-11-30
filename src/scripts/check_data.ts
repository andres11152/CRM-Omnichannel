import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function checkData() {
  try {
    console.log("🔍 Verificando datos en la base de datos...\n");

    // Check companies
    const companies = await prisma.company.findMany({
      include: {
        plan: true,
        _count: {
          select: {
            users: true,
          },
        },
      },
    });

    console.log(`📊 EMPRESAS (${companies.length}):`);
    companies.forEach((company) => {
      console.log(`   - ${company.name} (${company.id})`);
      console.log(
        `     Status: ${company.status}, Active: ${company.isActive}`
      );
      console.log(`     Plan: ${company.plan?.name || "Sin plan"}`);
      console.log(`     Usuarios: ${company._count.users}`);
      console.log("");
    });

    // Check users
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        companyId: true,
      },
    });

    console.log(`\n👥 USUARIOS (${users.length}):`);
    users.forEach((user) => {
      console.log(`   - ${user.email} (${user.role})`);
      console.log(`     Company ID: ${user.companyId || "null (MASTER)"}`);
    });

    // Check plans
    const plans = await prisma.plan.findMany();
    console.log(`\n📋 PLANES (${plans.length}):`);
    plans.forEach((plan) => {
      console.log(`   - ${plan.name} ($${plan.price})`);
    });
  } catch (error) {
    console.error("❌ Error:", error);
  } finally {
    await prisma.$disconnect();
  }
}

checkData();
