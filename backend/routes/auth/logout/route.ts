import { route, json } from "@/src/server/http/respond";
import { clearSessionCookie } from "@/src/server/auth/session";

export const runtime = "nodejs";

export const POST = route(async () => {
  const res = json({ ok: true });
  res.headers.set("Set-Cookie", clearSessionCookie());
  return res;
});
