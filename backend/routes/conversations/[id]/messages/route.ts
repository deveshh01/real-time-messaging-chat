import { route, json } from "@/src/server/http/respond";
import { Errors } from "@/src/lib/errors";
import { limiters } from "@/src/lib/rateLimiter";
import { requireAuthUser } from "@/src/server/auth/context";
import { listMessages, sendMessage } from "@/src/server/services/messageService";
import { fanoutMessage } from "@/server/socket/dispatch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Ctx {
  params: { id: string };
}

/** Cursor-paginated history: GET .../messages?cursor=<seq>&limit=<n> */
export const GET = route(async (req: Request, { params }: Ctx) => {
  const me = await requireAuthUser(req);
  const url = new URL(req.url);
  const cursorRaw = url.searchParams.get("cursor");
  const limitRaw = url.searchParams.get("limit");
  const cursor = cursorRaw ? Number(cursorRaw) : null;
  const limit = limitRaw ? Number(limitRaw) : undefined;
  if (cursor !== null && !Number.isFinite(cursor)) throw Errors.validation("Invalid cursor");

  const page = await listMessages(me.id, params.id, cursor, limit);
  return json(page);
});

/**
 * REST send fallback (primary path is the WebSocket). Same service, same
 * idempotency + moderation, and it still broadcasts to connected sockets. Lets
 * a client with a temporarily dead socket keep sending reliably.
 */
export const POST = route(async (req: Request, { params }: Ctx) => {
  const me = await requireAuthUser(req);
  const rl = limiters.message.consume(me.id);
  if (!rl.allowed) throw Errors.rateLimited(rl.retryAfterMs);

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const result = await sendMessage(me.id, { ...body, conversationId: params.id });
  await fanoutMessage(me.id, result);
  return json({ message: result.message }, { status: result.created ? 201 : 200 });
});
