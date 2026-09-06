import { env, googleEnabled } from "@/src/lib/env";
import { limiters } from "@/src/lib/rateLimiter";
import { clientIp } from "@/src/server/http/respond";
import { buildAuthUrl, randomState, stateCookie } from "@/src/server/auth/google";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Start the Google OAuth flow: set a CSRF state cookie and redirect to Google. */
export function GET(req: Request) {
  if (!googleEnabled) {
    return new Response(null, {
      status: 302,
      headers: { Location: `${env.APP_ORIGIN}/login?error=google_disabled` },
    });
  }
  const rl = limiters.auth.consume(`google:${clientIp(req)}`);
  if (!rl.allowed) {
    return new Response(null, {
      status: 302,
      headers: { Location: `${env.APP_ORIGIN}/login?error=rate_limited` },
    });
  }
  const state = randomState();
  return new Response(null, {
    status: 302,
    headers: {
      Location: buildAuthUrl(state),
      "Set-Cookie": stateCookie(state),
    },
  });
}
