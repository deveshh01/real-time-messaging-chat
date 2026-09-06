import { initials } from "@/lib/format";
import { UsersIcon } from "./icons";

interface Props {
  name: string;
  color: string;
  image?: string | null;
  online?: boolean;
  showPresence?: boolean;
  small?: boolean;
  large?: boolean;
  isGroup?: boolean;
}

export function Avatar({ name, color, image, online, showPresence, small, large, isGroup }: Props) {
  const bg = isGroup
    ? "linear-gradient(135deg, #6366f1 0%, #a855f7 100%)"
    : image
      ? "var(--surface-2)"
      : color;

  return (
    <span
      className={`avatar${small ? " sm" : ""}${large ? " lg" : ""}${isGroup ? " group-avatar" : ""}`}
      style={{ background: bg }}
      aria-hidden="true"
    >
      {image ? (
        <img src={image} alt="" className="avatar-img" referrerPolicy="no-referrer" />
      ) : isGroup ? (
        <UsersIcon size={small ? 14 : large ? 22 : 18} />
      ) : (
        initials(name)
      )}
      {showPresence && !isGroup && <span className="presence-dot" data-online={!!online} />}
    </span>
  );
}
