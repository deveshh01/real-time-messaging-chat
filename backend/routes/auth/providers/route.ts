import { json } from "@/src/server/http/respond";
import { googleEnabled } from "@/src/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public capability flags used by the login screen to show/hide provider buttons. */
export function GET() {
  return json({ google: googleEnabled });
}
