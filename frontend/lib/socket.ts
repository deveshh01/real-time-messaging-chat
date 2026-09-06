import { io, type Socket } from "socket.io-client";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from "@/types/socketEvents";

export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/**
 * Create the typed client socket. Auth rides on the httpOnly session cookie
 * (withCredentials), so no token is ever exposed to JS. Reconnection is handled
 * by Socket.IO with capped exponential backoff; the app reconciles missed
 * messages on 'connect' via the sync:since event rather than reloading.
 */
export function createSocket(): AppSocket {
  const backendUrl = process.env.NEXT_PUBLIC_SOCKET_URL || "";
  return io(backendUrl, {
    path: "/socket.io",
    withCredentials: true,
    autoConnect: false,
    transports: ["websocket", "polling"],
    reconnection: true,
    reconnectionDelay: 500,
    reconnectionDelayMax: 5000,
    timeout: 10000,
  });
}
