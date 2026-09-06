/** Small date/label helpers for the chat UI. */

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "?";
  const second = parts.length > 1 ? parts[parts.length - 1]![0] : "";
  return (first + second).toUpperCase();
}

export function timeShort(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (sameDay(d, today)) return "Today";
  if (sameDay(d, yesterday)) return "Yesterday";
  return d.toLocaleDateString([], { month: "short", day: "numeric", year: d.getFullYear() !== today.getFullYear() ? "numeric" : undefined });
}

export function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function relativeSeen(iso: string | undefined): string {
  if (!iso) return "offline";
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "last seen just now";
  if (min < 60) return `last seen ${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `last seen ${hr}h ago`;
  return `last seen ${dayLabel(iso)}`;
}

/** One-line preview of a conversation's last message. */
export function previewText(
  msg: { type: string; body: string | null; senderId: string; senderName?: string | null } | null,
  meId: string,
  isGroup = false,
): string {
  if (!msg) return "No messages yet";
  let prefix = "";
  if (msg.senderId === meId) {
    prefix = "You: ";
  } else if (isGroup && msg.senderName) {
    prefix = `${msg.senderName.split(" ")[0]}: `;
  }
  switch (msg.type) {
    case "IMAGE":
      return `${prefix}📷 Photo`;
    case "GIF":
      return `${prefix}GIF`;
    case "STICKER":
      return `${prefix}Sticker`;
    default:
      return prefix + (msg.body ?? "");
  }
}
