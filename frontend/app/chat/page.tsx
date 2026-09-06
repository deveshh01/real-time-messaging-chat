import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { ChatApp } from "@/components/chat/ChatApp";
import type { PublicUser } from "@/types/types";

// Always render per-request (auth-dependent).
export const dynamic = "force-dynamic";

async function getMe(): Promise<PublicUser | null> {
  const cookieHeader = cookies().toString();
  const backendUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
  try {
    const res = await fetch(`${backendUrl}/api/auth/me`, {
      headers: { cookie: cookieHeader },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.user) return null;
    return {
      ...data.user,
      image: data.user.image ?? null,
    };
  } catch {
    return null;
  }
}

export default async function ChatPage() {
  const user = await getMe();
  if (!user) redirect("/login");
  return <ChatApp currentUser={user} />;
}
