import { describe, it, expect } from "vitest";
import { toMessageDTO } from "@/src/server/services/serialize";
import type { Message, Attachment, User } from "@prisma/client";

function makeGroupMessage(
  seq: bigint,
  senderId: string,
  senderUser?: Partial<User>,
): Message & {
  attachment: Attachment | null;
  sender?: Pick<User, "id" | "username" | "displayName" | "avatarColor" | "lastSeenAt" | "image"> | null;
} {
  return {
    id: "m" + seq,
    seq,
    conversationId: "conv-group-1",
    senderId,
    type: "TEXT",
    body: "Hello team",
    attachmentId: null,
    clientId: "client-" + seq,
    createdAt: new Date("2024-01-01T00:00:00Z"),
    editedAt: null,
    deletedAt: null,
    attachment: null,
    sender: senderUser
      ? {
          id: senderId,
          username: senderUser.username ?? "user1",
          displayName: senderUser.displayName ?? "User One",
          avatarColor: senderUser.avatarColor ?? "#4f46e5",
          image: senderUser.image ?? null,
          lastSeenAt: new Date(),
        }
      : null,
  };
}

describe("Group Chat DTO & Serialization", () => {
  it("serializes message with sender details for group chat rendering", () => {
    const msg = makeGroupMessage(100n, "user1", {
      username: "alice",
      displayName: "Alice Smith",
      avatarColor: "#6366f1",
    });

    const dto = toMessageDTO(msg, "user2", { readSeq: 50n, deliveredSeq: 50n });

    expect(dto.id).toBe("m100");
    expect(dto.seq).toBe(100);
    expect(dto.senderId).toBe("user1");
    expect(dto.sender).toBeDefined();
    expect(dto.sender?.displayName).toBe("Alice Smith");
    expect(dto.sender?.username).toBe("alice");
  });

  it("calculates delivered and read status for outgoing group messages", () => {
    const msg = makeGroupMessage(200n, "user1");

    // All recipients delivered up to 200
    const deliveredDto = toMessageDTO(msg, "user1", { readSeq: 100n, deliveredSeq: 200n });
    expect(deliveredDto.status).toBe("delivered");

    // All recipients read up to 200
    const readDto = toMessageDTO(msg, "user1", { readSeq: 200n, deliveredSeq: 200n });
    expect(readDto.status).toBe("read");
  });
});
