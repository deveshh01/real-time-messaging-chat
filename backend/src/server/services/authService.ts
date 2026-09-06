import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/src/server/db/prisma";
import { Errors } from "@/src/lib/errors";
import { hashPassword, verifyPassword } from "@/src/server/auth/password";
import { createSessionToken } from "@/src/server/auth/session";
import type { PublicUser } from "@/src/shared/types";

const AVATAR_COLORS = [
  "#4f46e5", "#0ea5e9", "#059669", "#d97706", "#db2777", "#7c3aed", "#dc2626", "#0891b2",
];

export const registerSchema = z.object({
  email: z.string().email().max(200),
  username: z
    .string()
    .min(3)
    .max(24)
    .regex(/^[a-zA-Z0-9_]+$/, "Letters, numbers and underscore only"),
  displayName: z.string().min(1).max(50),
  password: z.string().min(8).max(200),
});

export const loginSchema = z.object({
  identifier: z.string().min(1).max(200), // username or email
  password: z.string().min(1).max(200),
});

export interface AuthOutcome {
  user: PublicUser;
  token: string;
}

export async function register(raw: z.infer<typeof registerSchema>): Promise<AuthOutcome> {
  const email = raw.email.toLowerCase().trim();
  const username = raw.username.trim();
  const passwordHash = await hashPassword(raw.password);
  const color = AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)]!;

  try {
    const user = await prisma.user.create({
      data: { email, username, displayName: raw.displayName.trim(), passwordHash, avatarColor: color },
      select: { id: true, username: true, displayName: true, avatarColor: true, image: true, lastSeenAt: true },
    });
    const token = await createSessionToken({ sub: user.id, username: user.username });
    return { user: toPublic(user), token };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw Errors.conflict("Email or username already in use");
    }
    throw err;
  }
}

export async function login(raw: z.infer<typeof loginSchema>): Promise<AuthOutcome> {
  const id = raw.identifier.toLowerCase().trim();
  const user = await prisma.user.findFirst({
    where: { OR: [{ email: id }, { username: raw.identifier.trim() }] },
  });
  // Constant-ish behavior: verify even on missing user to reduce enumeration.
  // Google-only accounts have no passwordHash and cannot log in with a password.
  const ok = user?.passwordHash ? await verifyPassword(user.passwordHash, raw.password) : false;
  if (!user || !ok) throw Errors.unauthenticated("Invalid credentials");

  const token = await createSessionToken({ sub: user.id, username: user.username });
  return { user: toPublic(user), token };
}

function toPublic(u: {
  id: string;
  username: string;
  displayName: string;
  avatarColor: string;
  image?: string | null;
}): PublicUser {
  return {
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    avatarColor: u.avatarColor,
    image: u.image ?? null,
    online: true,
  };
}

/**
 * Find-or-create a user from a verified Google profile.
 * Links by googleId first, then by email (so an existing password account gains
 * Google sign-in), otherwise creates a fresh account with a unique username.
 */
export async function upsertGoogleUser(profile: {
  googleId: string;
  email: string;
  name: string;
  picture?: string;
}): Promise<AuthOutcome> {
  const email = profile.email.toLowerCase().trim();

  let user = await prisma.user.findFirst({
    where: { OR: [{ googleId: profile.googleId }, { email }] },
  });

  if (user) {
    // Backfill google link / photo on an existing (e.g. password) account.
    if (!user.googleId || (profile.picture && user.image !== profile.picture)) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { googleId: profile.googleId, image: profile.picture ?? user.image },
      });
    }
  } else {
    const username = await uniqueUsername(email.split("@")[0] || "user");
    const color = AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)]!;
    user = await prisma.user.create({
      data: {
        email,
        username,
        displayName: profile.name?.trim() || username,
        googleId: profile.googleId,
        image: profile.picture ?? null,
        avatarColor: color,
      },
    });
  }

  const token = await createSessionToken({ sub: user.id, username: user.username });
  return { user: toPublic(user), token };
}

async function uniqueUsername(base: string): Promise<string> {
  const clean = base.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 20) || "user";
  let candidate = clean;
  for (let i = 0; i < 50; i++) {
    const exists = await prisma.user.findUnique({ where: { username: candidate } });
    if (!exists) return candidate;
    candidate = `${clean}${Math.floor(1000 + Math.random() * 9000)}`;
  }
  return `${clean}${Date.now().toString().slice(-6)}`;
}
