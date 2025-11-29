import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const wrongEmail = "573138081081@whatsapp.user"; // Currently assigned to customer
  const correctPhone = "3242450628";
  const correctEmail = `${correctPhone}@whatsapp.user`;

  console.log(`🔍 Finding user with wrong email: ${wrongEmail}`);
  const user = await prisma.user.findUnique({ where: { email: wrongEmail } });

  if (!user) {
    console.error("❌ User not found! Maybe it was already fixed?");
    return;
  }

  console.log(`👤 Found user: ${user.name} (${user.id})`);
  console.log(`🛠️ Updating to correct customer number: ${correctPhone}`);

  try {
    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        email: correctEmail,
        name: correctPhone,
      },
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
