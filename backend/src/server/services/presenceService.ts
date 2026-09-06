/**
 * In-memory presence tracker. Presence is derived from live socket connections,
 * counting sockets per user so multi-tab / multi-device stays consistent: a user
 * goes offline only when their LAST socket disconnects.
 *
 * Single-instance scope (modular monolith). For horizontal scale this maps onto
 * a Redis set / adapter with the same add/remove/isOnline surface.
 */
class PresenceService {
  private sockets = new Map<string, Set<string>>();

  /** @returns true if this connection transitioned the user online. */
  add(userId: string, socketId: string): boolean {
    let set = this.sockets.get(userId);
    const wasOffline = !set || set.size === 0;
    if (!set) {
      set = new Set();
      this.sockets.set(userId, set);
    }
    set.add(socketId);
    return wasOffline;
  }

  /** @returns true if this disconnection transitioned the user offline. */
  remove(userId: string, socketId: string): boolean {
    const set = this.sockets.get(userId);
    if (!set) return false;
    set.delete(socketId);
    if (set.size === 0) {
      this.sockets.delete(userId);
      return true;
    }
    return false;
  }

  isOnline(userId: string): boolean {
    return (this.sockets.get(userId)?.size ?? 0) > 0;
  }

  onlineUserIds(): string[] {
    return [...this.sockets.keys()];
  }
}

// Cache on globalThis so Next's dev module reloading doesn't wipe presence.
const g = globalThis as unknown as { __presence?: PresenceService };
export const presence = g.__presence ?? (g.__presence = new PresenceService());
