import { z } from "zod";
import { route, parseBody, json } from "@/src/server/http/respond";
import { requireAuthUser } from "@/src/server/auth/context";
import {
  getConversationDetails,
  updateGroupTitle,
} from "@/src/server/services/conversationService";
import { getConversationMembers } from "@/src/server/services/authz";
import { emitGroupUpdated } from "@/server/socket/broadcast";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Ctx {
  params: { id: string };
}

export const GET = route(async (req: Request, { params }: Ctx) => {
  const me = await requireAuthUser(req);
  const conversation = await getConversationDetails(me.id, params.id);
  return json({ conversation });
});

const patchSchema = z.object({ title: z.string().min(1).max(100) });

export const PATCH = route(async (req: Request, { params }: Ctx) => {
  const me = await requireAuthUser(req);
  const { title } = await parseBody(req, patchSchema);
  const result = await updateGroupTitle(me.id, params.id, title);

  const { members } = await getConversationMembers(me.id, params.id);
  emitGroupUpdated(
    { conversationId: params.id, type: "info_updated", title: result.title },
    members.map((m) => m.userId),
  );

  return json(result);
});
