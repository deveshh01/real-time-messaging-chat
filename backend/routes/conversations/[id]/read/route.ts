import { z } from "zod";
import { route, parseBody, json } from "@/src/server/http/respond";
import { requireAuthUser } from "@/src/server/auth/context";
import { markRead } from "@/src/server/services/readService";
import { emitStatus } from "@/server/socket/broadcast";

export const runtime = "nodejs";

const schema = z.object({ upToSeq: z.number().int().nonnegative() });

export const POST = route(async (req: Request, { params }: { params: { id: string } }) => {
  const me = await requireAuthUser(req);
  const { upToSeq } = await parseBody(req, schema);
  const res = await markRead(me.id, params.id, upToSeq);
  if (res.notifyUserIds.length) {
    emitStatus(params.id, res.readSeq, "read", me.id, res.notifyUserIds);
  }
  return json({ readSeq: res.readSeq });
});
