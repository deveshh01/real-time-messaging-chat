"use client";

import { useRef, useState } from "react";
import { GifPicker } from "./GifPicker";
import { StickerPicker } from "./StickerPicker";
import { SendIcon, ImageIcon, GifIcon, StickerIcon } from "./icons";

interface Props {
  onSendText: (text: string) => void;
  onSendImage: (file: File) => Promise<{ error?: string }>;
  onSendMedia: (
    type: "GIF" | "STICKER",
    media: { url: string; width?: number; height?: number; mime?: string },
  ) => void;
  onTyping: () => void;
  onStopTyping: () => void;
}

type Popover = "none" | "gif" | "sticker";

export function Composer({ onSendText, onSendImage, onSendMedia, onTyping, onStopTyping }: Props) {
  const [text, setText] = useState("");
  const [popover, setPopover] = useState<Popover>("none");
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function autosize() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
  }

  function submit() {
    const value = text.trim();
    if (!value) return;
    onSendText(value);
    setText("");
    setError(null); // Clear moderation error on successful send
    onStopTyping();
    requestAnimationFrame(() => {
      if (textareaRef.current) textareaRef.current.style.height = "auto";
    });
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file
    if (!file) return;
    setError(null);
    const res = await onSendImage(file);
    if (res.error) setError(res.error);
  }

  const togglePopover = (p: Popover) => setPopover((cur) => (cur === p ? "none" : p));

  return (
    <div className="composer" style={{ position: "relative" }}>
      {popover === "gif" && (
        <GifPicker
          onSelect={(g) => {
            onSendMedia("GIF", { url: g.url, width: g.width, height: g.height, mime: "image/gif" });
            setError(null);
            setPopover("none");
          }}
        />
      )}
      {popover === "sticker" && (
        <StickerPicker
          onSelect={(s) => {
            onSendMedia("STICKER", {
              url: `${window.location.origin}${s.url}`,
              mime: "image/svg+xml",
            });
            setError(null);
            setPopover("none");
          }}
        />
      )}

      {error && <div className="composer-error">{error}</div>}

      <div className="composer-row">
        <button className="icon-btn" onClick={() => fileRef.current?.click()} aria-label="Send image" title="Send image">
          <ImageIcon />
        </button>
        <button className="icon-btn" onClick={() => togglePopover("gif")} aria-label="Send GIF" title="GIF" aria-pressed={popover === "gif"}>
          <GifIcon />
        </button>
        <button className="icon-btn" onClick={() => togglePopover("sticker")} aria-label="Send sticker" title="Sticker" aria-pressed={popover === "sticker"}>
          <StickerIcon />
        </button>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={onFile} />

        <textarea
          ref={textareaRef}
          rows={1}
          placeholder="Send a message"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            autosize();
            if (e.target.value.trim()) onTyping();
            else onStopTyping();
          }}
          onKeyDown={onKeyDown}
          onBlur={onStopTyping}
          aria-label="Message"
        />

        <button className="send-btn" onClick={submit} disabled={!text.trim()} aria-label="Send message">
          <SendIcon />
        </button>
      </div>
    </div>
  );
}
