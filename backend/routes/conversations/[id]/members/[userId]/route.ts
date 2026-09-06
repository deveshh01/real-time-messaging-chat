import { route, json } from "@/src/server/http/respond";
import { requireAuthUser } from "@/src/server/auth/context";
import { removeGroupMember } from "@/src/server/services/conversationService";
import { getConversationMembers } from "@/src/server/services/authz";
import { emitGroupUpdated } from "@/server/socket/broadcast";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Ctx {
  params: { id: string; userId: string };
}

export const DELETE = route(async (req: Request, { params }: Ctx) => {
  const me = await requireAuthUser(req);

  // Get current members before removing target so we can notify all of them
  const { members } = await getConversationMembers(me.id, params.id);
  const notifyIds = members.map((m) => m.userId);

  const result = await removeGroupMember(me.id, params.id, params.userId);

  emitGroupUpdated(
    { conversationId: params.id, type: "member_removed", targetUserId: params.userId },
    notifyIds,
  );

  return json(result);
});
