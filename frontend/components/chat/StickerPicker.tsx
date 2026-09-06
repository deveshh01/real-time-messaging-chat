"use client";

import { STICKER_PACK } from "@/lib/stickers";

interface Props {
  onSelect: (sticker: { url: string }) => void;
}

export function StickerPicker({ onSelect }: Props) {
  return (
    <div className="picker" role="dialog" aria-label="Sticker picker">
      <div className="picker-head" style={{ fontWeight: 600, fontSize: 13 }}>
        {STICKER_PACK.name} pack
      </div>
      <div className="picker-grid stickers">
        {STICKER_PACK.stickers.map((s) => (
          <button key={s.id} onClick={() => onSelect({ url: s.url })} aria-label={`Send ${s.label} sticker`}>
            <img src={s.url} alt={s.label} loading="lazy" />
          </button>
        ))}
      </div>
    </div>
  );
}
