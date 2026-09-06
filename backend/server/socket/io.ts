import type { Server } from "socket.io";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  SocketData,
} from "@/src/shared/socketEvents";

export type AppServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;

/**
 * The Socket.IO server is created by the custom HTTP server (server/index.ts)
 * and registered here so Next.js REST route handlers can broadcast real-time
 * events too (e.g. a message sent over REST still reaches sockets). Cached on
 * globalThis to survive dev module reloading.
 */
const g = globalThis as unknown as { __io?: AppServer };

export function setIO(io: AppServer): void {
  g.__io = io;
}

export function getIO(): AppServer | null {
  return g.__io ?? null;
}

// Room helpers keep room naming in one place.
export const userRoom = (userId: string) => `user:${userId}`;
export const convRoom = (conversationId: string) => `conv:${conversationId}`;
