import { SignJWT, jwtVerify } from "jose";
import { serialize, parse } from "cookie";
import { env, isProd } from "@/src/lib/env";

/**
 * Stateless session: a signed (HS256) JWT stored in an httpOnly cookie.
 * The client can never read or forge it; the server is the sole authority on
 * "who is making this request".
 */
export const SESSION_COOKIE = "rc_session";

const secret = new TextEncoder().encode(env.AUTH_SECRET);

export interface SessionClaims {
  sub: string; // userId
  username: string;
}

export async function createSessionToken(claims: SessionClaims): Promise<string> {
  return new SignJWT({ username: claims.username })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime(`${env.SESSION_TTL_SECONDS}s`)
    .sign(secret);
}

export async function verifySessionToken(token: string): Promise<SessionClaims | null> {
  try {
    const { payload } = await jwtVerify(token, secret);
    if (!payload.sub || typeof payload.username !== "string") return null;
    return { sub: payload.sub, username: payload.username };
  } catch {
    return null;
  }
}

export function sessionCookie(token: string): string {
  return serialize(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: isProd,
    path: "/",
    maxAge: env.SESSION_TTL_SECONDS,
  });
}

export function clearSessionCookie(): string {
  return serialize(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: isProd,
    path: "/",
    maxAge: 0,
  });
}

/** Extract the raw session token from a Cookie header (REST or socket handshake). */
export function readTokenFromCookieHeader(header: string | undefined | null): string | null {
  if (!header) return null;
  const parsed = parse(header);
  return parsed[SESSION_COOKIE] ?? null;
}
