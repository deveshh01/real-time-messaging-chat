import { route, parseBody, json, clientIp } from "@/src/server/http/respond";
import { Errors } from "@/src/lib/errors";
import { limiters } from "@/src/lib/rateLimiter";
import { login, loginSchema } from "@/src/server/services/authService";
import { sessionCookie } from "@/src/server/auth/session";

export const runtime = "nodejs";

export const POST = route(async (req: Request) => {
  const rl = limiters.auth.consume(`login:${clientIp(req)}`);
  if (!rl.allowed) throw Errors.rateLimited(rl.retryAfterMs);

  const body = await parseBody(req, loginSchema);
  const { user, token } = await login(body);

  const res = json({ user });
  res.headers.set("Set-Cookie", sessionCookie(token));
  return res;
});
