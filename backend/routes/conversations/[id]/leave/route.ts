import { route, json } from "@/src/server/http/respond";
import { requireAuthUser } from "@/src/server/auth/context";
import { leaveGroup } from "@/src/server/services/conversationService";
import { getConversationMembers } from "@/src/server/services/authz";
import { emitGroupUpdated } from "@/server/socket/broadcast";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Ctx {
  params: { id: string };
}

export const POST = route(async (req: Request, { params }: Ctx) => {
  const me = await requireAuthUser(req);

  const { members } = await getConversationMembers(me.id, params.id);
  const notifyIds = members.map((m) => m.userId);

  const result = await leaveGroup(me.id, params.id);

  emitGroupUpdated(
    {
      conversationId: params.id,
      type: "member_left",
      targetUserId: me.id,
      newAdminId: result.newAdminId,
    },
    notifyIds,
  );

  return json(result);
});
