import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const oldEmail = "45908938997905@whatsapp.user";
  const newPhone = "573138081081";
  const newEmail = `${newPhone}@whatsapp.user`;

  console.log(`🔍 Finding user with old email: ${oldEmail}`);
  const user = await prisma.user.findUnique({ where: { email: oldEmail } });

  if (!user) {
    console.error("❌ User not found!");
    return;
  }

  console.log(`👤 Found user: ${user.name} (${user.id})`);
  console.log(`🛠️ Updating email to: ${newEmail}`);

  try {
    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: { email: newEmail, name: newPhone }, // Update name too for clarity
    });
    console.log("✅ User updated successfully!");
    console.log(updatedUser);
  } catch (error) {
    console.error("❌ Update failed:", error);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
