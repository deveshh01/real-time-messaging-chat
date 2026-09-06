import { route, json } from "@/src/server/http/respond";
import { requireAuthUser } from "@/src/server/auth/context";
import { searchUsers } from "@/src/server/services/conversationService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route(async (req: Request) => {
  const me = await requireAuthUser(req);
  const q = new URL(req.url).searchParams.get("q") ?? "";
  const users = await searchUsers(q, me.id);
  return json({ users });
});
