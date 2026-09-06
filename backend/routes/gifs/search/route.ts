import { route, json } from "@/src/server/http/respond";
import { Errors } from "@/src/lib/errors";
import { limiters } from "@/src/lib/rateLimiter";
import { requireAuthUser } from "@/src/server/auth/context";
import { searchGifs } from "@/src/server/services/gifService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route(async (req: Request) => {
  const me = await requireAuthUser(req);
  const rl = limiters.gif.consume(me.id);
  if (!rl.allowed) throw Errors.rateLimited(rl.retryAfterMs);

  const url = new URL(req.url);
  const q = url.searchParams.get("q") ?? "";
  const pos = url.searchParams.get("pos");
  const result = await searchGifs(q, pos);
  return json(result);
});
