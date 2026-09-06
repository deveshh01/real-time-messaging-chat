import { PrismaClient } from "@prisma/client";
import argon2 from "argon2";

const prisma = new PrismaClient();

/**
 * Seeds two demo accounts you can sign into from two browsers/profiles:
 *   alice / password123   and   bob / password123
 * plus a shared conversation with a few messages.
 */
async function main() {
  const passwordHash = await argon2.hash("password123", { type: argon2.argon2id });

  const alice = await prisma.user.upsert({
    where: { username: "alice" },
    update: {},
    create: {
      email: "alice@example.com",
      username: "alice",
      displayName: "Alice Johnson",
      passwordHash,
      avatarColor: "#4f46e5",
    },
  });

  const bob = await prisma.user.upsert({
    where: { username: "bob" },
    update: {},
    create: {
      email: "bob@example.com",
      username: "bob",
      displayName: "Bob Smith",
      passwordHash,
      avatarColor: "#059669",
    },
  });

  const charlie = await prisma.user.upsert({
    where: { username: "charlie" },
    update: {},
    create: {
      email: "charlie@example.com",
      username: "charlie",
      displayName: "Charlie Brown",
      passwordHash,
      avatarColor: "#d97706",
    },
  });

  const david = await prisma.user.upsert({
    where: { username: "david" },
    update: {},
    create: {
      email: "david@example.com",
      username: "david",
      displayName: "David Miller",
      passwordHash,
      avatarColor: "#dc2626",
    },
  });

  // Only seed a conversation if none exists between them.
  const existing = await prisma.conversation.findFirst({
    where: {
      isGroup: false,
      AND: [
        { members: { some: { userId: alice.id } } },
        { members: { some: { userId: bob.id } } },
      ],
    },
  });

  if (!existing) {
    const conv = await prisma.conversation.create({
      data: { isGroup: false, members: { create: [{ userId: alice.id }, { userId: bob.id }] } },
    });
    let n = 0;
    for (const [sender, body] of [
      [alice, "Hey Bob! 👋"],
      [bob, "Hi Alice, how are you?"],
      [alice, "Doing great — testing out this new chat app."],
      [bob, "It looks really clean. Real-time works nicely!"],
    ] as const) {
      await prisma.message.create({
        data: {
          conversationId: conv.id,
          senderId: sender.id,
          type: "TEXT",
          body,
          clientId: `seed-${conv.id}-${n++}`,
        },
      });
    }
  }

  console.log("Seed complete. Login with alice / password123 or bob / password123");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
