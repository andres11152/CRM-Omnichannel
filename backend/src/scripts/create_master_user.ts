import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function createMasterUser() {
  try {
    console.log("🔍 Buscando usuario master@reply.com...");

    // Check if master user exists
    const existingMaster = await prisma.user.findUnique({
      where: { email: "master@reply.com" },
    });

    if (existingMaster) {
      console.log("✅ Usuario master@reply.com ya existe");
      console.log(`   - ID: ${existingMaster.id}`);
      console.log(`   - Rol: ${existingMaster.role}`);
      console.log(`   - Company ID: ${existingMaster.companyId || "null"}`);

      // Update role if needed
      if (existingMaster.role !== "MASTER") {
        console.log("⚠️  Actualizando rol a MASTER...");
        await prisma.user.update({
          where: { id: existingMaster.id },
          data: { role: "MASTER", companyId: null },
        });
        console.log("✅ Rol actualizado a MASTER");
      }
    } else {
      console.log("➕ Creando usuario master@reply.com...");
      const hashedPassword = await bcrypt.hash("master123", 12);

      const masterUser = await prisma.user.create({
        data: {
          email: "master@reply.com",
          name: "Master Admin",
          password: hashedPassword,
          role: "MASTER",
          companyId: null, // Master doesn't belong to any company
        },
      });

      console.log("✅ Usuario MASTER creado exitosamente");
      console.log(`   - Email: ${masterUser.email}`);
      console.log(`   - Password: master123`);
      console.log(`   - ID: ${masterUser.id}`);
    }

    // Also check/create company admin user for testing
    console.log("\n🔍 Verificando usuario admin@reply.com...");
    const adminUser = await prisma.user.findUnique({
      where: { email: "admin@reply.com" },
    });

    if (adminUser) {
      console.log("✅ Usuario admin@reply.com existe");
      console.log(`   - ID: ${adminUser.id}`);
      console.log(`   - Rol: ${adminUser.role}`);
      console.log(`   - Company ID: ${adminUser.companyId}`);

      if (adminUser.companyId) {
        const company = await prisma.company.findUnique({
          where: { id: adminUser.companyId },
        });
        if (company) {
          console.log(`   - Empresa: ${company.name}`);
        }
      }
    } else {
      console.log(
        "⚠️  Usuario admin@reply.com NO existe - necesita ser creado"
      );
    }

    console.log("\n✅ Verificación completada");
  } catch (error) {
    console.error("❌ Error:", error);
  } finally {
    await prisma.$disconnect();
  }
}

createMasterUser();
