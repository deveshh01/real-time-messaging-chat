import { Errors } from "@/src/lib/errors";
import { prisma } from "@/src/server/db/prisma";
import { SESSION_COOKIE, verifySessionToken, readTokenFromCookieHeader } from "./session";

export interface AuthUser {
  id: string;
  username: string;
  displayName: string;
  avatarColor: string;
  image: string | null;
}

/**
 * Resolve the authenticated user for a route handler from the httpOnly
 * session cookie. Returns null when unauthenticated.
 *
 * The user id ALWAYS comes from the verified token — never from the request
 * body/query — which is what prevents identity spoofing.
 */
export async function getAuthUser(req?: Request): Promise<AuthUser | null> {
  let token: string | null = null;
  if (req) {
    token = readTokenFromCookieHeader(req.headers.get("cookie"));
  } else {
    try {
      // Dynamic import in case called in Next.js environment
      const { cookies } = await import("next/headers");
      token = cookies().get(SESSION_COOKIE)?.value ?? null;
    } catch {
      token = null;
    }
  }
  if (!token) return null;
  const claims = await verifySessionToken(token);
  if (!claims) return null;

  const user = await prisma.user.findUnique({
    where: { id: claims.sub },
    select: { id: true, username: true, displayName: true, avatarColor: true, image: true },
  });
  return user;
}

/** Same as getAuthUser but throws a 401 AppError when unauthenticated. */
export async function requireAuthUser(req?: Request): Promise<AuthUser> {
  const user = await getAuthUser(req);
  if (!user) throw Errors.unauthenticated();
  return user;
}
