import { z } from "zod";
import { route, parseBody, json } from "@/src/server/http/respond";
import { requireAuthUser } from "@/src/server/auth/context";
import { addGroupMembers } from "@/src/server/services/conversationService";
import { getConversationMembers } from "@/src/server/services/authz";
import { emitGroupUpdated } from "@/server/socket/broadcast";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Ctx {
  params: { id: string };
}

const addMembersSchema = z.object({
  userIds: z.array(z.string().min(1)).min(1),
});

export const POST = route(async (req: Request, { params }: Ctx) => {
  const me = await requireAuthUser(req);
  const { userIds } = await parseBody(req, addMembersSchema);
  const result = await addGroupMembers(me.id, params.id, userIds);

  const { members } = await getConversationMembers(me.id, params.id);
  const allParticipantIds = Array.from(new Set([...members.map((m) => m.userId), ...result.addedUserIds]));

  for (const addedId of result.addedUserIds) {
    emitGroupUpdated(
      { conversationId: params.id, type: "member_added", targetUserId: addedId },
      allParticipantIds,
    );
  }

  return json(result, { status: 201 });
});
