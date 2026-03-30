import { getEmojiImage } from "./storage";
import { EMOJI_REF_PREFIX } from "./types";

export const TRANSPARENT_PIXEL =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

const cache = new Map<string, string>();
const pending = new Map<string, Promise<string | null>>();

export function isEmojiRef(url: string): boolean {
  return url.startsWith(EMOJI_REF_PREFIX);
}

function parseRef(ref: string): { sourceId: string; name: string } | null {
  const rest = ref.slice(EMOJI_REF_PREFIX.length);
  const slashIdx = rest.indexOf("/");
  if (slashIdx === -1) return null;
  return { sourceId: rest.slice(0, slashIdx), name: rest.slice(slashIdx + 1) };
}

/**
 * Convert a data URL to a blob URL for faster browser rendering.
 * Blob URLs skip the base64 decode step that data URLs require.
 */
function toBlobUrl(dataUrl: string): string {
  try {
    const commaIdx = dataUrl.indexOf(",");
    if (commaIdx === -1) return dataUrl;
    const header = dataUrl.slice(0, commaIdx);
    const base64 = dataUrl.slice(commaIdx + 1);
    const mime = header.match(/:(.*?);/)?.[1] ?? "image/png";
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return URL.createObjectURL(new Blob([bytes], { type: mime }));
  } catch {
    return dataUrl;
  }
}

/**
 * Resolves an emoji ref (ref:sourceId/name) to a displayable image URL.
 * Non-ref strings are returned as-is. Individual images are fetched from
 * storage (~5ms each) and cached in memory for the page lifetime.
 * Data URLs are converted to blob URLs for faster rendering.
 */
export async function resolveImageUrl(ref: string): Promise<string> {
  if (!isEmojiRef(ref)) return ref;

  const cached = cache.get(ref);
  if (cached) return cached;

  const parsed = parseRef(ref);
  if (!parsed) return ref;

  let result = pending.get(ref);
  if (!result) {
    result = getEmojiImage(parsed.sourceId, parsed.name);
    pending.set(ref, result);
  }

  try {
    const imageUrl = await result;
    if (imageUrl) {
      const displayUrl = imageUrl.startsWith("data:") ? toBlobUrl(imageUrl) : imageUrl;
      cache.set(ref, displayUrl);
      return displayUrl;
    }
  } finally {
    pending.delete(ref);
  }

  return ref;
}

export function clearResolverCache(): void {
  cache.clear();
  pending.clear();
}
