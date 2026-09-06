import { route, parseBody, json, clientIp } from "@/src/server/http/respond";
import { Errors } from "@/src/lib/errors";
import { limiters } from "@/src/lib/rateLimiter";
import { register, registerSchema } from "@/src/server/services/authService";
import { sessionCookie } from "@/src/server/auth/session";

export const runtime = "nodejs";

export const POST = route(async (req: Request) => {
  const rl = limiters.auth.consume(`register:${clientIp(req)}`);
  if (!rl.allowed) throw Errors.rateLimited(rl.retryAfterMs);

  const body = await parseBody(req, registerSchema);
  const { user, token } = await register(body);

  const res = json({ user }, { status: 201 });
  res.headers.set("Set-Cookie", sessionCookie(token));
  return res;
});
