import type { IncomingMessage, ServerResponse } from "node:http";
import { env } from "@/src/lib/env";

import * as authLogin from "@/routes/auth/login/route";
import * as authLogout from "@/routes/auth/logout/route";
import * as authRegister from "@/routes/auth/register/route";
import * as authMe from "@/routes/auth/me/route";
import * as authProviders from "@/routes/auth/providers/route";
import * as authGoogle from "@/routes/auth/google/route";
import * as authGoogleCallback from "@/routes/auth/google/callback/route";
import * as conversations from "@/routes/conversations/route";
import * as conversationDetail from "@/routes/conversations/[id]/route";
import * as conversationLeave from "@/routes/conversations/[id]/leave/route";
import * as conversationRead from "@/routes/conversations/[id]/read/route";
import * as conversationMessages from "@/routes/conversations/[id]/messages/route";
import * as conversationMembers from "@/routes/conversations/[id]/members/route";
import * as conversationMemberUser from "@/routes/conversations/[id]/members/[userId]/route";
import * as users from "@/routes/users/route";
import * as upload from "@/routes/upload/route";
import * as gifsSearch from "@/routes/gifs/search/route";
import * as attachments from "@/routes/attachments/[id]/route";

export async function handleHttpApi(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const url = new URL(req.url ?? "/", `http://${req.headers.host || "localhost"}`);
  const pathname = url.pathname;
  const method = req.method?.toUpperCase() ?? "GET";

  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", env.APP_ORIGIN || "*");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, Cookie");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");

  if (method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return true;
  }

  // Only handle /api/... requests
  if (!pathname.startsWith("/api/")) {
    return false;
  }

  let handler: ((req: Request, ctx?: any) => Response | Promise<Response>) | undefined;
  let params: Record<string, string> = {};

  if (pathname === "/api/auth/login" && method === "POST") handler = authLogin.POST;
  else if (pathname === "/api/auth/logout" && method === "POST") handler = authLogout.POST;
  else if (pathname === "/api/auth/register" && method === "POST") handler = authRegister.POST;
  else if (pathname === "/api/auth/me" && method === "GET") handler = authMe.GET;
  else if (pathname === "/api/auth/providers" && method === "GET") handler = authProviders.GET;
  else if (pathname === "/api/auth/google" && method === "GET") handler = authGoogle.GET;
  else if (pathname === "/api/auth/google/callback" && method === "GET") handler = authGoogleCallback.GET;
  else if (pathname === "/api/conversations" && method === "GET") handler = conversations.GET;
  else if (pathname === "/api/conversations" && method === "POST") handler = conversations.POST;
  else if (pathname === "/api/users" && method === "GET") handler = users.GET;
  else if (pathname === "/api/upload" && method === "POST") handler = upload.POST;
  else if (pathname === "/api/gifs/search" && method === "GET") handler = gifsSearch.GET;
  else {
    const leaveMatch = pathname.match(/^\/api\/conversations\/([^/]+)\/leave$/);
    const readMatch = pathname.match(/^\/api\/conversations\/([^/]+)\/read$/);
    const messagesMatch = pathname.match(/^\/api\/conversations\/([^/]+)\/messages$/);
    const memberUserMatch = pathname.match(/^\/api\/conversations\/([^/]+)\/members\/([^/]+)$/);
    const membersMatch = pathname.match(/^\/api\/conversations\/([^/]+)\/members$/);
    const convMatch = pathname.match(/^\/api\/conversations\/([^/]+)$/);
    const attachMatch = pathname.match(/^\/api\/attachments\/([^/]+)$/);

    if (leaveMatch && method === "POST") {
      handler = conversationLeave.POST;
      params = { id: leaveMatch[1]! };
    } else if (readMatch && method === "POST") {
      handler = conversationRead.POST;
      params = { id: readMatch[1]! };
    } else if (messagesMatch && method === "GET") {
      handler = conversationMessages.GET;
      params = { id: messagesMatch[1]! };
    } else if (messagesMatch && method === "POST") {
      handler = conversationMessages.POST;
      params = { id: messagesMatch[1]! };
    } else if (memberUserMatch && method === "DELETE") {
      handler = conversationMemberUser.DELETE;
      params = { id: memberUserMatch[1]!, userId: memberUserMatch[2]! };
    } else if (membersMatch && method === "POST") {
      handler = conversationMembers.POST;
      params = { id: membersMatch[1]! };
    } else if (convMatch && method === "GET") {
      handler = conversationDetail.GET;
      params = { id: convMatch[1]! };
    } else if (convMatch && method === "PATCH") {
      handler = conversationDetail.PATCH;
      params = { id: convMatch[1]! };
    } else if (attachMatch && method === "GET") {
      handler = attachments.GET;
      params = { id: attachMatch[1]! };
    }
  }

  if (!handler) {
    res.statusCode = 404;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: { code: "NOT_FOUND", message: "Route not found" } }));
    return true;
  }

  try {
    let bodyBuffer: Buffer | undefined;
    if (method !== "GET" && method !== "HEAD") {
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(chunk);
      }
      bodyBuffer = Buffer.concat(chunks);
    }

    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (Array.isArray(v)) {
        for (const val of v) headers.append(k, val);
      } else if (v !== undefined) {
        headers.set(k, v);
      }
    }

    const webReq = new Request(url.toString(), {
      method,
      headers,
      body: bodyBuffer,
    });

    const webRes = await handler(webReq, { params });

    res.statusCode = webRes.status;
    webRes.headers.forEach((value, key) => {
      if (key.toLowerCase() === "set-cookie") {
        const existing = res.getHeader("Set-Cookie");
        if (!existing) {
          res.setHeader("Set-Cookie", value);
        } else if (Array.isArray(existing)) {
          res.setHeader("Set-Cookie", [...existing, value]);
        } else {
          res.setHeader("Set-Cookie", [existing as string, value]);
        }
      } else {
        res.setHeader(key, value);
      }
    });

    const arrayBuffer = await webRes.arrayBuffer();
    res.end(Buffer.from(arrayBuffer));
  } catch (err) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: { code: "INTERNAL", message: (err as Error).message } }));
  }

  return true;
}
