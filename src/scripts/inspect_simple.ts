import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const conversations = await prisma.conversation.findMany({
    where: { subject: { contains: "Orion" } },
    include: {
      participants: true,
      messages: { take: 3, orderBy: { createdAt: "desc" } },
    },
  });

  for (const conv of conversations) {
    console.log(`Conv: ${conv.id}`);
    const userPart = conv.participants.find((p) => p.role === "USER");
    console.log(`USER Participant: ${userPart?.id} (${userPart?.name})`);

    conv.messages.forEach((m) => {
      console.log(
        `Msg: ${m.content.substring(0, 20)}... | Sender: ${
          m.senderId
        } | Match? ${m.senderId === userPart?.id}`
      );
    });
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
