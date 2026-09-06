import { env } from "@/src/lib/env";
import { logger } from "@/src/lib/logger";

export interface GifResult {
  id: string;
  /** Small preview used in the picker grid. */
  previewUrl: string;
  /** Full GIF url sent into the conversation. */
  url: string;
  width: number;
  height: number;
}

export interface GifSearchResponse {
  enabled: boolean;
  gifs: GifResult[];
  next: string | null;
}

const DISABLED: GifSearchResponse = { enabled: false, gifs: [], next: null };

/**
 * Server-side GIF search proxy. The API key stays on the server (never shipped
 * to the client), content filtering is forced on, and results are normalized so
 * the client is provider-agnostic. Returns `enabled:false` (not an error) when
 * no key is configured, so the UI degrades gracefully.
 */
export async function searchGifs(
  query: string,
  pos: string | null,
  limit = 24,
): Promise<GifSearchResponse> {
  if (!env.GIF_API_KEY) return DISABLED;
  try {
    return env.GIF_PROVIDER === "giphy"
      ? await searchGiphy(query, pos, limit)
      : await searchTenor(query, pos, limit);
  } catch (err) {
    logger.warn("gif search failed", { err: (err as Error).message });
    return DISABLED;
  }
}

async function searchTenor(query: string, pos: string | null, limit: number): Promise<GifSearchResponse> {
  const url = new URL("https://tenor.googleapis.com/v2/search");
  url.searchParams.set("key", env.GIF_API_KEY);
  url.searchParams.set("q", query || "trending");
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("contentfilter", "high"); // force safe content
  url.searchParams.set("media_filter", "tinygif,gif");
  if (pos) url.searchParams.set("pos", pos);

  const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
  if (!res.ok) throw new Error(`tenor ${res.status}`);
  const data = (await res.json()) as TenorResponse;

  const gifs: GifResult[] = [];
  for (const r of data.results ?? []) {
    const tiny = r.media_formats.tinygif ?? r.media_formats.gif;
    const full = r.media_formats.gif ?? r.media_formats.tinygif;
    if (!tiny || !full) continue;
    gifs.push({
      id: r.id,
      previewUrl: tiny.url,
      url: full.url,
      width: full.dims?.[0] ?? 0,
      height: full.dims?.[1] ?? 0,
    });
  }
  return { enabled: true, gifs, next: data.next || null };
}

async function searchGiphy(query: string, pos: string | null, limit: number): Promise<GifSearchResponse> {
  const offset = pos ? Number(pos) : 0;
  const url = new URL("https://api.giphy.com/v1/gifs/search");
  url.searchParams.set("api_key", env.GIF_API_KEY);
  url.searchParams.set("q", query || "trending");
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("offset", String(offset));
  url.searchParams.set("rating", "g"); // force safe content

  const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
  if (!res.ok) throw new Error(`giphy ${res.status}`);
  const data = (await res.json()) as GiphyResponse;

  const gifs: GifResult[] = (data.data ?? []).map((g) => ({
    id: g.id,
    previewUrl: g.images.fixed_width_small?.url ?? g.images.fixed_width.url,
    url: g.images.fixed_width.url,
    width: Number(g.images.fixed_width.width) || 0,
    height: Number(g.images.fixed_width.height) || 0,
  }));
  const nextOffset = offset + gifs.length;
  return { enabled: true, gifs, next: gifs.length === limit ? String(nextOffset) : null };
}

// ---- provider response shapes (only the fields we use) ----
interface TenorMedia {
  url: string;
  dims?: [number, number];
}
interface TenorResponse {
  next?: string;
  results?: Array<{
    id: string;
    media_formats: { tinygif?: TenorMedia; gif?: TenorMedia };
  }>;
}
interface GiphyImage {
  url: string;
  width: string;
  height: string;
}
interface GiphyResponse {
  data?: Array<{
    id: string;
    images: { fixed_width: GiphyImage; fixed_width_small?: GiphyImage };
  }>;
}
