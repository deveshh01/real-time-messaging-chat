import { describe, it, expect } from "vitest";
import { toMessageDTO } from "@/src/server/services/serialize";
import type { Message, Attachment } from "@prisma/client";

function makeMessage(seq: bigint, senderId: string): Message & { attachment: Attachment | null } {
  return {
    id: "m" + seq,
    seq,
    conversationId: "c1",
    senderId,
    type: "TEXT",
    body: "hi",
    attachmentId: null,
    clientId: "client-" + seq,
    createdAt: new Date("2024-01-01T00:00:00Z"),
    editedAt: null,
    deletedAt: null,
    attachment: null,
  };
}

describe("toMessageDTO status derivation (no per-message receipts)", () => {
  const me = "alice";
  const other = "bob";

  it("outgoing message is 'sent' when peer watermarks are behind", () => {
    const dto = toMessageDTO(makeMessage(10n, me), me, { readSeq: 5n, deliveredSeq: 5n });
    expect(dto.status).toBe("sent");
  });

  it("outgoing message is 'delivered' when peer delivered watermark >= seq", () => {
    const dto = toMessageDTO(makeMessage(10n, me), me, { readSeq: 5n, deliveredSeq: 10n });
    expect(dto.status).toBe("delivered");
  });

  it("outgoing message is 'read' when peer read watermark >= seq", () => {
    const dto = toMessageDTO(makeMessage(10n, me), me, { readSeq: 12n, deliveredSeq: 12n });
    expect(dto.status).toBe("read");
  });

  it("incoming messages are not decorated with sender-only ticks", () => {
    const dto = toMessageDTO(makeMessage(10n, other), me, { readSeq: 0n, deliveredSeq: 0n });
    expect(dto.status).toBe("sent");
    expect(dto.senderId).toBe(other);
  });

  it("serializes bigint seq to a JS number", () => {
    const dto = toMessageDTO(makeMessage(42n, me), me, { readSeq: 0n, deliveredSeq: 0n });
    expect(dto.seq).toBe(42);
    expect(typeof dto.seq).toBe("number");
  });
});
