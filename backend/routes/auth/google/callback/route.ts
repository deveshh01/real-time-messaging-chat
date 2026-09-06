import { env, googleEnabled } from "@/src/lib/env";
import { logger } from "@/src/lib/logger";
import {
  exchangeCodeForProfile,
  readState,
  clearStateCookie,
} from "@/src/server/auth/google";
import { upsertGoogleUser } from "@/src/server/services/authService";
import { sessionCookie } from "@/src/server/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function redirect(url: string): Response {
  return new Response(null, { status: 302, headers: { Location: url } });
}

/** Google redirects here with ?code&state. Verify, upsert the user, sign in. */
export async function GET(req: Request) {
  const loginUrl = (err: string) => `${env.APP_ORIGIN}/login?error=${err}`;
  if (!googleEnabled) return redirect(loginUrl("google_disabled"));

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const returnedState = url.searchParams.get("state");
  const expectedState = readState(req.headers.get("cookie"));

  // CSRF: state from Google must match the one we stored in the cookie.
  if (!code || !returnedState || !expectedState || returnedState !== expectedState) {
    return redirect(loginUrl("google_state"));
  }

  try {
    const profile = await exchangeCodeForProfile(code);
    if (!profile.emailVerified) return redirect(loginUrl("google_unverified"));

    const { token } = await upsertGoogleUser(profile);
    const res = new Response(null, {
      status: 302,
      headers: { Location: `${env.APP_ORIGIN}/chat` },
    });
    // Set the session cookie and clear the one-time state cookie.
    res.headers.append("Set-Cookie", sessionCookie(token));
    res.headers.append("Set-Cookie", clearStateCookie());
    return res;
  } catch (err) {
    logger.error("google callback failed", { err: (err as Error).message });
    return redirect(loginUrl("google_failed"));
  }
}
