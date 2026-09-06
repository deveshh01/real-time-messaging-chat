import type { Socket } from "socket.io";
import type { ExtendedError } from "socket.io";
import { readTokenFromCookieHeader, verifySessionToken } from "@/src/server/auth/session";
import { prisma } from "@/src/server/db/prisma";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  SocketData,
} from "@/src/shared/socketEvents";

type AppSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;

/**
 * Socket.IO handshake authentication. The identity comes ONLY from the verified
 * httpOnly session cookie sent with the WebSocket upgrade — never from client
 * `auth`/query params — so a socket cannot impersonate another user.
 */
export async function socketAuth(
  socket: AppSocket,
  next: (err?: ExtendedError) => void,
): Promise<void> {
  try {
    const token = readTokenFromCookieHeader(socket.handshake.headers.cookie);
    if (!token) return next(new Error("unauthorized"));
    const claims = await verifySessionToken(token);
    if (!claims) return next(new Error("unauthorized"));

    const user = await prisma.user.findUnique({
      where: { id: claims.sub },
      select: { id: true, username: true },
    });
    if (!user) return next(new Error("unauthorized"));

    socket.data.userId = user.id;
    socket.data.username = user.username;
    next();
  } catch {
    next(new Error("unauthorized"));
  }
}
