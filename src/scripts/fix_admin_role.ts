import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function fixAdminRole() {
  try {
    console.log("🔍 Buscando usuario admin@reply.com...");

    const user = await prisma.user.findUnique({
      where: { email: "admin@reply.com" },
    });

    if (user) {
      console.log(`   - Rol actual: ${user.role}`);

      if (user.role !== "ADMIN") {
        console.log("⚠️  Actualizando rol a ADMIN...");
        await prisma.user.update({
          where: { id: user.id },
          data: { role: "ADMIN" },
        });
        console.log("✅ Rol actualizado a ADMIN");
      } else {
        console.log("✅ El rol ya es ADMIN");
      }
    } else {
      console.log("❌ Usuario admin@reply.com no encontrado");
    }
  } catch (error) {
    console.error("❌ Error:", error);
  } finally {
    await prisma.$disconnect();
  }
}

fixAdminRole();
