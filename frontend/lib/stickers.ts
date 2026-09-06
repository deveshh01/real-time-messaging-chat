/** Bundled sticker pack served from /public/stickers. Lightweight inline SVGs. */
export interface Sticker {
  id: string;
  url: string;
  label: string;
}

export const STICKER_PACK: { name: string; stickers: Sticker[] } = {
  name: "Classic",
  stickers: [
    { id: "smile", url: "/stickers/smile.svg", label: "Smile" },
    { id: "laugh", url: "/stickers/laugh.svg", label: "Laugh" },
    { id: "heart", url: "/stickers/heart.svg", label: "Heart" },
    { id: "thumbsup", url: "/stickers/thumbsup.svg", label: "Thumbs up" },
    { id: "cry", url: "/stickers/cry.svg", label: "Crying" },
    { id: "star", url: "/stickers/star.svg", label: "Star" },
    { id: "fire", url: "/stickers/fire.svg", label: "Fire" },
    { id: "party", url: "/stickers/party.svg", label: "Party" },
  ],
};
