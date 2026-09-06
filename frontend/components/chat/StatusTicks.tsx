import type { MessageStatus } from "@/types/types";
import { CheckIcon, DoubleCheckIcon, ClockIcon, AlertIcon } from "./icons";

/** Compact status indicator shown on the sender's own outgoing messages. */
export function StatusTicks({ status }: { status: MessageStatus }) {
  switch (status) {
    case "sending":
      return (
        <span className="ticks" title="Sending" aria-label="Sending">
          <ClockIcon />
        </span>
      );
    case "failed":
      return (
        <span className="ticks" title="Failed to send" aria-label="Failed" style={{ color: "#fecaca" }}>
          <AlertIcon />
        </span>
      );
    case "sent":
      return (
        <span className="ticks" title="Sent" aria-label="Sent">
          <CheckIcon />
        </span>
      );
    case "delivered":
      return (
        <span className="ticks" title="Delivered" aria-label="Delivered">
          <DoubleCheckIcon />
        </span>
      );
    case "read":
      return (
        <span className="ticks" data-read="true" title="Read" aria-label="Read">
          <DoubleCheckIcon />
        </span>
      );
  }
}
