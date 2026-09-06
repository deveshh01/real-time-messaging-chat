import { serialize, parse } from "cookie";
import { env, googleRedirectUri, isProd } from "@/src/lib/env";

/**
 * Minimal, dependency-free Google OAuth 2.0 (authorization-code) flow.
 * We keep the client secret on the server and derive identity from Google's
 * userinfo endpoint. A signed-ish random `state` (stored in a short-lived
 * httpOnly cookie) protects against CSRF on the callback.
 */
const STATE_COOKIE = "rc_oauth_state";
const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const USERINFO_ENDPOINT = "https://openidconnect.googleapis.com/v1/userinfo";

export interface GoogleProfile {
  googleId: string;
  email: string;
  emailVerified: boolean;
  name: string;
  picture?: string;
}

export function randomState(): string {
  const arr = new Uint8Array(24);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function buildAuthUrl(state: string): string {
  const url = new URL(AUTH_ENDPOINT);
  url.searchParams.set("client_id", env.GOOGLE_CLIENT_ID);
  url.searchParams.set("redirect_uri", googleRedirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", state);
  url.searchParams.set("access_type", "online");
  url.searchParams.set("prompt", "select_account");
  return url.toString();
}

export function stateCookie(state: string): string {
  return serialize(STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: isProd,
    path: "/",
    maxAge: 600, // 10 minutes to complete the flow
  });
}

export function clearStateCookie(): string {
  return serialize(STATE_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: isProd,
    path: "/",
    maxAge: 0,
  });
}

export function readState(cookieHeader: string | null | undefined): string | null {
  if (!cookieHeader) return null;
  return parse(cookieHeader)[STATE_COOKIE] ?? null;
}

/** Exchange the authorization code for tokens, then fetch the user profile. */
export async function exchangeCodeForProfile(code: string): Promise<GoogleProfile> {
  const tokenRes = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: googleRedirectUri,
      grant_type: "authorization_code",
    }),
    signal: AbortSignal.timeout(8000),
  });
  if (!tokenRes.ok) throw new Error(`google token exchange failed: ${tokenRes.status}`);
  const tokens = (await tokenRes.json()) as { access_token?: string };
  if (!tokens.access_token) throw new Error("google token exchange: no access_token");

  const infoRes = await fetch(USERINFO_ENDPOINT, {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
    signal: AbortSignal.timeout(8000),
  });
  if (!infoRes.ok) throw new Error(`google userinfo failed: ${infoRes.status}`);
  const info = (await infoRes.json()) as {
    sub: string;
    email: string;
    email_verified?: boolean;
    name?: string;
    picture?: string;
  };
  if (!info.sub || !info.email) throw new Error("google userinfo: missing sub/email");

  return {
    googleId: info.sub,
    email: info.email,
    emailVerified: Boolean(info.email_verified),
    name: info.name ?? info.email.split("@")[0]!,
    picture: info.picture,
  };
}
