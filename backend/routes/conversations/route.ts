import { z } from "zod";
import { route, parseBody, json } from "@/src/server/http/respond";
import { requireAuthUser } from "@/src/server/auth/context";
import {
  listConversations,
  getOrCreateDirectConversation,
  createGroupConversation,
} from "@/src/server/services/conversationService";
import { emitGroupUpdated } from "@/server/socket/broadcast";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route(async (req: Request) => {
  const me = await requireAuthUser(req);
  const conversations = await listConversations(me.id);
  return json({ conversations });
});

const createDirectSchema = z.object({
  userId: z.string().min(1),
  isGroup: z.literal(false).optional(),
});

const createGroupSchema = z.object({
  isGroup: z.literal(true),
  title: z.string().min(1).max(100),
  userIds: z.array(z.string().min(1)).min(1),
});

const createSchema = z.union([createDirectSchema, createGroupSchema]);

export const POST = route(async (req: Request) => {
  const me = await requireAuthUser(req);
  const body = await parseBody(req, createSchema);

  if ("isGroup" in body && body.isGroup === true) {
    const conversationId = await createGroupConversation(me.id, body.title, body.userIds);
    const participants = Array.from(new Set([me.id, ...body.userIds]));
    emitGroupUpdated({ conversationId, type: "created", title: body.title }, participants);
    return json({ conversationId }, { status: 201 });
  } else {
    const conversationId = await getOrCreateDirectConversation(me.id, (body as z.infer<typeof createDirectSchema>).userId);
    return json({ conversationId }, { status: 201 });
  }
});
