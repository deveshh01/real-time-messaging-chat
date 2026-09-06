import { route, json } from "@/src/server/http/respond";
import { requireAuthUser } from "@/src/server/auth/context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route(async (req: Request) => {
  const user = await requireAuthUser(req);
  return json({ user });
});
