"use client";

import { useEffect, useRef, useState } from "react";
import { gifApi } from "@/lib/apiClient";
import type { GifResult } from "@/types/types";

interface Props {
  onSelect: (gif: { url: string; width: number; height: number }) => void;
}

export function GifPicker({ onSelect }: Props) {
  const [query, setQuery] = useState("");
  const [gifs, setGifs] = useState<GifResult[]>([]);
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const debounce = useRef<ReturnType<typeof setTimeout>>();
  const reqId = useRef(0);

  useEffect(() => {
    clearTimeout(debounce.current);
    debounce.current = setTimeout(async () => {
      const id = ++reqId.current;
      setLoading(true);
      try {
        const res = await gifApi.search(query.trim(), null);
        if (id !== reqId.current) return; // stale response guard
        setEnabled(res.enabled);
        setGifs(res.gifs);
      } catch {
        if (id === reqId.current) setGifs([]);
      } finally {
        if (id === reqId.current) setLoading(false);
      }
    }, 300);
    return () => clearTimeout(debounce.current);
  }, [query]);

  return (
    <div className="picker" role="dialog" aria-label="GIF picker">
      <div className="picker-head">
        <input
          autoFocus
          placeholder="Search GIFs…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      {!enabled ? (
        <div className="picker-empty">
          GIF search isn&apos;t configured. Add a GIF_API_KEY to enable it.
        </div>
      ) : loading && gifs.length === 0 ? (
        <div className="picker-empty">Loading…</div>
      ) : gifs.length === 0 ? (
        <div className="picker-empty">No GIFs found.</div>
      ) : (
        <div className="picker-grid">
          {gifs.map((g) => (
            <button
              key={g.id}
              onClick={() => onSelect({ url: g.url, width: g.width, height: g.height })}
              aria-label="Send GIF"
            >
              <img src={g.previewUrl} alt="" loading="lazy" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
