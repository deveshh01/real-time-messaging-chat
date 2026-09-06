import { PrismaClient } from "@prisma/client";
import argon2 from "argon2";

const prisma = new PrismaClient();

/**
 * DEV-ONLY: generates a large (10,000+ message) conversation between
 * alice/bob so pagination and query performance can be verified against a
 * realistic history size instead of the handful of messages in prisma/seed.ts.
 *
 * Usage:
 *   npm run db:seed:load                # default 12,000 messages
 *   MESSAGE_COUNT=25000 npm run db:seed:load
 *
 * This does NOT run as part of `prisma db seed` (that stays wired to the
 * small seed.ts demo dataset) so it never accidentally runs against a
 * shared/staging database. Refuses to run when NODE_ENV=production.
 */
async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("seedLoad.ts is a development-only tool; refusing to run in production");
  }

  const total = Number(process.env.MESSAGE_COUNT ?? 12_000);
  const batchSize = 500;

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

  let conv = await prisma.conversation.findFirst({
    where: {
      isGroup: false,
      AND: [
        { members: { some: { userId: alice.id } } },
        { members: { some: { userId: bob.id } } },
      ],
    },
  });
  if (!conv) {
    conv = await prisma.conversation.create({
      data: { isGroup: false, members: { create: [{ userId: alice.id }, { userId: bob.id }] } },
    });
  }

  const already = await prisma.message.count({ where: { conversationId: conv.id } });
  const toCreate = Math.max(0, total - already);
  console.log(
    `Conversation ${conv.id} has ${already} messages; creating ${toCreate} more (target ${total})...`,
  );

  const startedAt = Date.now();
  for (let i = 0; i < toCreate; i += batchSize) {
    const n = Math.min(batchSize, toCreate - i);
    const rows = Array.from({ length: n }, (_, j) => {
      const idx = already + i + j;
      const sender = idx % 2 === 0 ? alice : bob;
      return {
        conversationId: conv!.id,
        senderId: sender.id,
        type: "TEXT" as const,
        body: `Load-test message #${idx}`,
        clientId: `load-${conv!.id}-${idx}`,
      };
    });
    // createMany skips the app-level idempotency path deliberately — this is
    // bulk seed data, not traffic through sendMessage().
    await prisma.message.createMany({ data: rows, skipDuplicates: true });
    if ((i / batchSize) % 10 === 0) {
      console.log(`  ...${already + i + n}/${total}`);
    }
  }
  await prisma.conversation.update({ where: { id: conv.id }, data: { updatedAt: new Date() } });

  const finalCount = await prisma.message.count({ where: { conversationId: conv.id } });
  console.log(
    `Done in ${((Date.now() - startedAt) / 1000).toFixed(1)}s. Conversation ${conv.id} now has ${finalCount} messages.`,
  );
  console.log(
    "Verify pagination: log in as alice/bob, open the conversation, and confirm only the",
    "most recent page loads immediately and scrolling up fetches older pages without lag.",
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
